import {IdGenerator, STP} from "../native/OverlayRecord";
import {Schedule} from "../native/Schedule";
import {RouteType} from "../file/Route";
import {Days, ScheduleCalendar} from "../native/ScheduleCalendar";
import {ScheduleStopTimeRow} from "./CIFRepository";
import {StopTime} from "../file/StopTime";
import moment = require("moment");

const pickupActivities = ["T ", "TB", "U "];
const dropOffActivities = ["T ", "TF", "D "];
const coordinatedActivity = ["R "];
const notAdvertised = "N ";

/**
 * This class takes a stream of results and builds a list of Schedules
 */
export class ScheduleBuilder {
  private readonly schedules: Schedule[] = [];
  private maxId: number = 0;

  /**
   * Take a stream of ScheduleStopTimeRow, turn them into Schedule objects and add the result to the schedules
   */
  public loadSchedules(results: any): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      let stops: StopTime[] = [];
      let prevRow: ScheduleStopTimeRow;
      let arrivalTimeWithMoment,departureTimeWithMoment;
      let departureHour = 4;

      results.on("result", (row: ScheduleStopTimeRow) => {
        if (prevRow && prevRow.id !== row.id) {
          this.schedules.push(this.createScheduleBasedOnSameCIFSchedule(prevRow, stops));
          // this.schedules.push(this.createSchedule(prevRow, stops));
          stops = [];

          //Code below sets the departure hour from the real time data to avoid instances of trains arriving before they leave.
          arrivalTimeWithMoment = this.formatRealTimeStamp(row.actual_timestamp_1);
          departureTimeWithMoment = this.formatRealTimeStamp(row.actual_timestamp_2);

          //If no real time data available, use public arrival/departure time to set departure hour.
          departureHour = arrivalTimeWithMoment
            ? parseInt(arrivalTimeWithMoment.substr(0, 2), 10)
            : departureTimeWithMoment
            ? parseInt(departureTimeWithMoment.substr(0, 2), 10)
            : row.public_arrival_time
            ? parseInt(row.public_arrival_time.substr(0, 2), 10)
            : row.public_departure_time
            ? parseInt(row.public_departure_time.substr(0, 2), 10) : 4;
        }

        if (row.stp_indicator !== STP.Cancellation) {
          const stop = this.createStop(row, stops.length + 1, departureHour);

          if (prevRow && prevRow.id === row.id && row.crs_code === prevRow.crs_code) {
            if (stop.pickup_type === 0 || stop.drop_off_type === 0) {
              const currentLargestCorrectionInd = stops[stops.length - 1].correctionIndTotal;
              const newCorrectionInd = stop.correctionIndTotal;
              if(newCorrectionInd > currentLargestCorrectionInd) {
                stops[stops.length - 1] = Object.assign(stop, { stop_sequence: stops.length });
              }
            }
          }
          else {
            stops.push(stop);
          }
        }

        prevRow = row;
      });

      results.on("end", () => {
        if (prevRow) {
          this.schedules.push(this.createScheduleBasedOnSameCIFSchedule(prevRow, stops));
        }

        resolve();
      });
      results.on("error", reject);
    });
  }

  // todo gtc remove
  // private createSchedule(row: ScheduleStopTimeRow, stops: StopTime[]): Schedule {
  //   this.maxId = Math.max(this.maxId, row.id);
  //
  //   return new Schedule(
  //     row.id,
  //     stops,
  //     row.train_uid,
  //     row.retail_train_id,
  //     new ScheduleCalendar(
  //       moment(row.runs_from),
  //       moment(row.runs_to),
  //       <Days>{
  //         0: Number(row.sunday),
  //         1: Number(row.monday),
  //         2: Number(row.tuesday),
  //         3: Number(row.wednesday),
  //         4: Number(row.thursday),
  //         5: Number(row.friday),
  //         6: Number(row.saturday)
  //       }
  //     ),
  //     routeTypeIndex.hasOwnProperty(row.train_category) ? routeTypeIndex[row.train_category] : RouteType.Rail,
  //     row.atoc_code,
  //     row.stp_indicator,
  //     row.train_class !== "S",
  //     row.reservations !== null
  //   );
  // }

  private createScheduleBasedOnSameCIFSchedule(row: ScheduleStopTimeRow, stops: StopTime[]): Schedule {
    this.maxId = Math.max(this.maxId, row.id);
    return new Schedule(
      row.id,
      stops,
      row.train_uid,
      row.retail_train_id,
      new ScheduleCalendar(
        moment(row.event_date),
        moment(row.event_date),
        <Days>{
          0: Number(moment(row.event_date).weekday() === 0),
          1: Number(moment(row.event_date).weekday() === 1),
          2: Number(moment(row.event_date).weekday() === 2),
          3: Number(moment(row.event_date).weekday() === 3),
          4: Number(moment(row.event_date).weekday() === 4),
          5: Number(moment(row.event_date).weekday() === 5),
          6: Number(moment(row.event_date).weekday() === 6)
        }
      ),
      routeTypeIndex.hasOwnProperty(row.train_category) ? routeTypeIndex[row.train_category] : RouteType.Rail,
      row.atoc_code,
      row.stp_indicator,
      row.train_class !== "S",
      row.reservations !== null
    );
  }

  private createStop(row: ScheduleStopTimeRow, stopId: number, departHour: number): StopTime {
    let arrivalTime, departureTime,arrivalTimeWithMoment,departureTimeWithMoment;
    let unadvertisedArrival = false;
    let unadvertisedDeparture = false;

    // Use the real time data
    arrivalTimeWithMoment = this.formatRealTimeStamp(row.actual_timestamp_1);
    departureTimeWithMoment = this.formatRealTimeStamp(row.actual_timestamp_2);
    arrivalTime = this.formatTime(arrivalTimeWithMoment, departHour);
    departureTime = this.formatTime(departureTimeWithMoment, departHour);

    // todo gtc remove this by updating the query to return correct departure time.
    // Minor formatting, as the query will return the departure of a journey as an arrival
    if (row.event_type === 'DEPARTURE' && departureTime === null) {
      departureTime = arrivalTime;
      arrivalTime = null;
    }

    if(row.public_arrival_time == "00:00:00") {
      unadvertisedArrival = true;
    }

    if(row.public_departure_time == "00:00:00") {
      unadvertisedDeparture = true;
    }

    const activities = row.activity.match(/.{1,2}/g) || [];
    const pickup = pickupActivities.find(a => activities.includes(a)) && !activities.includes(notAdvertised) && !unadvertisedDeparture ? 0 : 1;
    const coordinatedDropOff = coordinatedActivity.find(a => activities.includes(a)) ? 3 : 0;
    const dropOff = dropOffActivities.find(a => activities.includes(a)) && !unadvertisedArrival ? 0 : 1;

    // Mitigating against timestamps at passing stations which have recorded the departure time before the arrival time.
    if (departureTime !== null && departureTime < arrivalTime){
      arrivalTime = departureTime;
    }

    // Calculate the TRUST correction indicator total:
    const correctionIndicatorTotal = +row.correction_ind_1 + +row.correction_ind_2;
    return {
      trip_id: row.id, // todo gtc the row.id here is really the cif_schedule id.
      arrival_time: (arrivalTime || departureTime),
      departure_time: (departureTime || arrivalTime),
      stop_id: row.crs_code,
      stop_sequence: stopId,
      stop_headsign: row.platform,
      pickup_type: coordinatedDropOff || pickup,
      drop_off_type: coordinatedDropOff || dropOff,
      shape_dist_traveled: null,
      timepoint: 1,
      correctionIndTotal: correctionIndicatorTotal
    };
  }

  private formatRealTimeStamp(timeStamp: Object | null){
    if (timeStamp===null) {
      return null;
    } else {
      timeStamp = moment(timeStamp).format("HH:mm:ss");
      return timeStamp;
    }
  }

  private formatTime(time: string | null, originDepartureHour: number) {
    if (time === null) return null;

    const departureHour = parseInt(time.substr(0, 2), 10);

    // if the service started after 4am and after the current stops departure hour we've probably rolled over midnight
    if (originDepartureHour >= 4 && originDepartureHour > departureHour) {
      return (departureHour + 24) + time.substr(2);
    }

    return time;
  }

  public get results(): ScheduleResults {
    return {
      schedules: this.schedules,
      idGenerator: this.getIdGenerator(this.maxId)
    };
  }

  private *getIdGenerator(startId: number): IterableIterator<number> {
    let id = startId + 1;
    while (true) {
      yield id++;
    }
  }
}

export interface ScheduleResults {
  schedules: Schedule[],
  idGenerator: IdGenerator
}

const routeTypeIndex: object = {
  "OO": RouteType.Rail,
  "XX": RouteType.Rail,
  "XZ": RouteType.Rail,
  "BR": RouteType.Gondola,
  "BS": RouteType.Bus,
  "OL": RouteType.Subway,
  "XC": RouteType.Rail,
  "SS": RouteType.Ferry
};
