import {DatabaseConnection} from "../../database/DatabaseConnection";
import {Transfer} from "../file/Transfer";
import {CRS, Stop} from "../file/Stop";
import moment = require("moment");
import {ScheduleCalendar, Days} from "../native/ScheduleCalendar";
import {Association, AssociationType, DateIndicator} from "../native/Association";
import {RSID, STP, TUID} from "../native/OverlayRecord";
import {ScheduleBuilder, ScheduleResults} from "./ScheduleBuilder";
import {RouteType} from "../file/Route";
import {Duration} from "../native/Duration";
import {FixedLink} from "../file/FixedLink";

/**
 * Provide access to the CIF/TTIS data in a vaguely GTFS-ish shape.
 */
export class CIFRepository {

  constructor(
    private readonly db: DatabaseConnection,
    private readonly stream,
    private readonly stationCoordinates: StationCoordinates,
    private readonly startRange,
    private readonly endRange,
    private readonly excludeFixedLinks: boolean = false,
    private readonly excludeVstpSchedules: boolean = false,
  ) {}


  /**
   * Return the interchange time between each station
   */
  public async getTransfers(): Promise<Transfer[]> {
    const [results] = await this.db.query<Transfer[]>(`
    SELECT 
    crs_code AS from_stop_id, 
    crs_code AS to_stop_id, 
    2 AS transfer_type, 
    loc.min_change_time * 60 AS min_transfer_time 
  FROM master_location as loc WHERE loc.interchange_status != ""
  AND loc.crs_code != ""
  GROUP BY loc.crs_code
    `);

    return results;
  }

  /**
   * Return all the stops with some configurable long/lat applied
   */
  public async getStops(): Promise<Stop[]> {
    const [results] = await this.db.query<Stop[]>(`
    SELECT
    crs_code AS stop_id, 
    tiploc AS stop_code,
    station_name AS stop_name,
    interchange_status AS stop_desc,
    0 AS stop_lat,
    0 AS stop_lon,
    NULL AS zone_id,
    NULL AS stop_url,
    NULL AS location_type,
    NULL AS parent_station,
    IF(POSITION("(CIE" IN station_name), "Europe/Dublin", "Europe/London") AS stop_timezone,
    0 AS wheelchair_boarding 
  FROM master_location WHERE (crs_code IS NOT NULL AND crs_code != "")
  GROUP BY crs_code
    `);

    // overlay the long and latitude values from configuration
    return results;
  }

  /**
   * Return the schedules and z trains. These queries probably require some explanation:
   *
   * The first query selects the real stop times for all passenger services for the specified day, excluding offroutes.
   *
   * The second query selects all the z-trains (usually replacement buses) within three months. They already use CRS
   * codes as the location so avoid the disaster above.
   */
  public async getSchedules(): Promise<ScheduleResults> {
    console.log(`Start to generate schedules, time: ${new Date().toLocaleString()}`)
    const scheduleBuilder = new ScheduleBuilder();

    const datePairs = this.getDatesBetweenDates(this.startRange.format("YYYY-MM-DD"), this.endRange.format("YYYY-MM-DD"));
    console.log(`Will retrieve trust data for these date pairs: ${datePairs}`)
    for (let dateRange of datePairs) {
      await this.waitForSeconds(2);
      const startDate = dateRange[0]
      const endDate = dateRange[1]
      console.log(`Generating schedule for ${startDate} to ${endDate} on: ${new Date().toLocaleString()}`)

      const queryTemplate = this.stream.query(`
SELECT ta.activation_id                                                   AS id,
       s.train_uid,
       e.rsid                                                          AS retail_train_id,
       greatest(s.wef_date, COALESCE(s.import_wef_date, s.wef_date))   AS runs_from,
       least(s.weu_date, COALESCE(s.import_weu_date, s.weu_date))      AS runs_to,
       loc.crs_code                                                    AS crs_code,
       s.stp_indicator                                                 AS stp_indicator,
       sloc.location_order,
       tma.event_type                                                  AS event_type,
       ta.tp_origin_timestamp                                          AS event_date,
       tma.correction_ind                                              AS correction_ind_1,
       tmd.correction_ind                                              AS correction_ind_2,
       tma.actual_timestamp                                            AS actual_timestamp_1,
       tmd.actual_timestamp                                            AS actual_timestamp_2,
       sloc.public_arrival_time,
       sloc.public_departure_time,
       IF(s.train_status = "S", "SS", s.train_category)                AS train_category,
       IFNULL(sloc.scheduled_arrival_time, sloc.scheduled_pass_time)   AS scheduled_arrival_time,
       IFNULL(sloc.scheduled_departure_time, sloc.scheduled_pass_time) AS scheduled_departure_time,
       sloc.platform,
       e.atoc_code,
       sloc.schedule_location_id                                       AS stop_id,
       COALESCE(sloc.activity, "")                                     AS activity,
       s.reservations,
       s.train_class

FROM train_activation ta
       LEFT JOIN train_movement AS tma ON tma.activation_id = ta.activation_id
                                            AND tma.event_type IN ('ARRIVAL', 'DEPARTURE')
                                            AND tma.offroute_ind IS FALSE
       LEFT JOIN train_movement AS tmd ON ta.activation_id = tmd.activation_id
                                            AND tmd.loc_stanox = tma.loc_stanox
                                            AND (tma.movement_id IS NULL OR
                                                 Coalesce(tmd.schedule_location_id, 1) = Coalesce(tma.schedule_location_id, 1))
                                            AND tmd.event_type != tma.event_type
                                            AND tmd.offroute_ind is FALSE
       LEFT JOIN train_movement tm_last on ta.last_train_movement = tm_last.movement_id
       LEFT JOIN cif_schedule s on s.schedule_id = tm_last.schedule_id and s.stp_indicator not in ('C')
       LEFT JOIN cif_schedule_extra AS e ON e.schedule_id = s.schedule_id
       LEFT JOIN cif_schedule_location AS sloc ON tma.schedule_location_id = sloc.schedule_location_id
       LEFT JOIN master_location AS loc ON sloc.tiploc = loc.tiploc

WHERE 
    ta.tp_origin_timestamp between ? and ?
    and ta.train_uid in('Y45975','Y45997')
  AND loc.crs_code IS NOT NULL
  AND loc.crs_code != ""
  AND sloc.schedule_location_id IS NOT NULL
  AND ((tma.event_type = 'ARRIVAL' AND tmd.event_type IS NULL) OR (tma.event_type = 'DEPARTURE' AND tmd.event_type IS NULL)
         OR (tmd.event_type = 'DEPARTURE' AND tma.event_type = 'ARRIVAL'))
  AND (tma.schedule_location_id = tmd.schedule_location_id OR IF(tmd.schedule_location_id IS NULL, '1', '0') = '1')

    HAVING runs_to >= runs_from
    ORDER BY ta.activation_id, ta.tp_origin_timestamp, sloc.location_order
      `, [startDate, endDate]);

      await Promise.all([
        scheduleBuilder.loadSchedules(queryTemplate),
      ]);
      console.log(`Finished generating schedule for ${startDate} to ${endDate} on: ${new Date().toLocaleString()}`)
    }

    console.log("Schedule size", scheduleBuilder.results.schedules.length);
    console.log(`Finished to generate schedules, time: ${new Date().toLocaleString()}`)
    return scheduleBuilder.results;
  }

  /**
   * Get associations
   */
  public async getAssociations(): Promise<Association[]> {
    const [results] = await this.db.query<AssociationRow[]>(`
    SELECT a.association_id as id,
    a.main_train_uid as base_uid,
    a.associated_train_uid as assoc_uid,
    loc.crs_code,
   a.association_date_ind as assoc_date_ind,
    a.association_category as assoc_cat,
   SUBSTRING(a.valid_days, 1, 1 ) as monday,
   SUBSTRING(a.valid_days, 2, 1 ) as tuesday,
   SUBSTRING(a.valid_days, 3, 1 ) as wednesday,
   SUBSTRING(a.valid_days, 4, 1 ) as thursday,
   SUBSTRING(a.valid_days, 5, 1 ) as friday,
   SUBSTRING(a.valid_days, 6, 1 ) as saturday,
   SUBSTRING(a.valid_days, 7, 1 ) as sunday,
   a.wef_date as start_date,
   a.weu_date as end_date,
   a.stp_indicator
    FROM cif_association as a
     
     JOIN master_location as loc ON a.association_tiploc = loc.tiploc
   
     WHERE a.wef_date < ?
     AND a.weu_date >= ?
     AND (loc.crs_code IS NOT NULL AND loc.crs_code != "")
     ORDER BY a.stp_indicator DESC, a.association_id;
    `, [this.endRange.format("YYYY-MM-DD"), this.startRange.format("YYYY-MM-DD")]);
    console.log("Assosiation size:" ,results.length)
    return results.map(row => new Association(
      row.id,
      row.base_uid,
      row.assoc_uid,
      row.crs_code,
      row.assoc_date_ind,
      row.assoc_cat,
      new ScheduleCalendar(
        moment(row.start_date),
        moment(row.end_date), <Days>{
        0: Number(row.sunday),
        1: Number(row.monday),
        2: Number(row.tuesday),
        3: Number(row.wednesday),
        4: Number(row.thursday),
        5: Number(row.friday),
        6: Number(row.saturday)
      }),
      row.stp_indicator
    ));
  }

  /**
   * Return the ALF information
   */
  public async getFixedLinks(): Promise<FixedLink[]> {
    const results: FixedLink[] = [];
    // If excludeFixedLinks flag is set to true, we will return empty FixedLink here.
    if(this.excludeFixedLinks) {
      return results;
    }

    // use the additional fixed links if possible and fill the missing data with fixed_links
    const [rows] = await this.db.query<FixedLinkRow>(`
      SELECT
        mode, duration * 60 as duration, origin, destination,
        start_time, end_time, start_date, end_date,
        monday, tuesday, wednesday, thursday, friday, saturday, sunday
      FROM additional_fixed_link
      WHERE origin IN (SELECT crs_code FROM master_location)
      AND destination IN (SELECT crs_code FROM master_location)
      UNION
      SELECT
        link_mode, link_time * 60 as duration, origin, destination,
        "00:00:00", "23:59:59", "2017-01-01", "2038-01-19",
        1,1,1,1,1,1,1
      FROM ttis_fixed_link
      WHERE CONCAT(origin, destination) NOT IN (
        SELECT CONCAT(origin, destination) FROM additional_fixed_link
      )
    `);

    for (const row of rows) {
      results.push(this.getFixedLinkRow(row.origin, row.destination, row));
      results.push(this.getFixedLinkRow(row.destination, row.origin, row));
    }

    return results;
  }

  private getFixedLinkRow(origin: CRS, destination: CRS, row: FixedLinkRow): FixedLink {
    return {
      from_stop_id: origin,
      to_stop_id: destination,
      mode: row.mode,
      duration: row.duration,
      start_time: row.start_time,
      end_time: row.end_time,
      start_date: (row.start_date || "2017-01-01"),
      end_date: (row.end_date || "2038-01-19"),
      monday: row.monday,
      tuesday: row.tuesday,
      wednesday: row.wednesday,
      thursday: row.thursday,
      friday: row.friday,
      saturday: row.saturday,
      sunday: row.sunday
    };
  }

  /**
   * Close the underlying database
   */
  public end(): Promise<any> {
    return Promise.all([this.db.end(), this.stream.end()]);
  }

  public waitForSeconds(seconds) {
    return new Promise(function (resolve) {
      setTimeout(resolve, seconds * 1000);
    })
  }

  /**
   * Output a list of sublist, each sublist has 2 adjacent dates/same dates which is used to fulfil the SQL between condition: `ta.tp_origin_timestamp between ? and ?`
   * e.g. start = '2021-01-01' and end = '2021-01-05' will output [['2021-01-01', '2021-01-02'], ['2021-01-03', '2021-01-04'], ['2021-01-05', '2021-01-05']].
   */
  public getDatesBetweenDates(start, end): string[][] {
    let dates: string[] = []
    const startDate = new Date(start);
    const endDate = new Date(end);
    if (startDate.valueOf() > endDate.valueOf()) {
      throw new Error(`start date: ${start} cannot be greater than end date: ${end}.`)
    }
    const theDate = new Date(startDate)
    while (theDate < endDate) {
      dates = [...dates, theDate.toISOString().split('T')[0]]
      theDate.setDate(theDate.getDate() + 1)
    }
    dates = [...dates, end]
    if (dates.length % 2 !== 0) {
      dates.push(end);
    }
    let results: string[][] = [];
    while (dates.length) {
      results.push(dates.splice(0, 2));
    }
    return results;
  }


}

export interface ScheduleStopTimeRow {
  id: number,
  train_uid: TUID,
  retail_train_id: RSID,
  runs_from: string,
  runs_to: string,
  stp_indicator: STP,
  crs_code: CRS,
  train_category: string,
  atoc_code: string | null,
  event_type: string,
  event_date: string,
  correction_ind_1: string,
  correction_ind_2: string,
  actual_timestamp_1: Object | null,
  actual_timestamp_2: Object | null,
  public_arrival_time: string | null,
  public_departure_time: string | null,
  scheduled_arrival_time: string | null,
  scheduled_departure_time: string | null,
  platform: string,
  activity: string,
  train_class: null | "S" | "B",
  reservations: null | "R" | "S" | "A"
}

export type StationCoordinates = {
  [crs: string]: {
    stop_lat: number,
    stop_lon: number,
    stop_name: string
  }
};

interface AssociationRow {
  id: number;
  base_uid: string;
  assoc_uid: string;
  crs_code: CRS;
  start_date: string;
  end_date: string;
  assoc_date_ind: DateIndicator,
  assoc_cat: AssociationType,
  sunday: 0 | 1;
  monday: 0 | 1;
  tuesday: 0 | 1;
  wednesday: 0 | 1;
  thursday: 0 | 1;
  friday: 0 | 1;
  saturda: 0 | 1;
  stp_indicator: STP;
}

interface FixedLinkRow {
  mode: FixedLinkMode;
  duration: Duration;
  origin: CRS;
  destination: CRS;
  start_time: string;
  end_time: string;
  start_date: string | null;
  end_date: string | null;
  monday: 0 | 1;
  tuesday: 0 | 1;
  wednesday: 0 | 1;
  thursday: 0 | 1;
  friday: 0 | 1;
  saturday: 0 | 1;
  sunday: 0 | 1;
}

enum FixedLinkMode {
  Walk = "WALK",
  Metro = "METRO",
  Transfer = "TRANSFER",
  Tube = "TUBE",
  Bus = "BUS"
}
