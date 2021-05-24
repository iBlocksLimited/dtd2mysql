import {IdGenerator} from "../native/OverlayRecord";
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

      results.on("result", (row: ScheduleStopTimeRow) => {
        if (prevRow && prevRow.id !== row.id) {
          // We enter this if block only if this is the first stop of a new train activation and there is a prev train activation.
          this.schedules.push(this.createScheduleBasedOnSameCIFSchedule(prevRow, stops));
          stops = [];
        }

        const stop = this.createStop(row, stops.length + 1);

        if (prevRow && prevRow.id === row.id && row.crs_code === prevRow.crs_code) {
          if (stop.pickup_type === 0 || stop.drop_off_type === 0) {
            const currentLargestCorrectionInd = stops[stops.length - 1].correctionIndTotal;
            const newCorrectionInd = stop.correctionIndTotal;
            // If previous stop is a passing point with same CRS code, we use this calling point to replace the passing point as
            // passing point is not important for timetabling/journey generation and double up stops might cause issue.
            const previousStopIsPassingPoint = stops[stops.length - 1].pickup_type === 1 && stops[stops.length - 1].drop_off_type === 1
            if (newCorrectionInd > currentLargestCorrectionInd || previousStopIsPassingPoint) {
              stops[stops.length - 1] = Object.assign(stop, {stop_sequence: stops.length});
            }
          }
        } else {
          stops.push(stop);
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

  private createStop(row: ScheduleStopTimeRow, stopId: number): StopTime {
    let arrivalTimestampMoment, departureTimestampMoment, formattedArrivalTime,
            formattedDepartureTime;
    let unadvertisedArrival = false;
    let unadvertisedDeparture = false;

    // Use the real time data
    arrivalTimestampMoment = this.convertActualTimestampToMoment(row.actual_timestamp_1);
    departureTimestampMoment = this.convertActualTimestampToMoment(row.actual_timestamp_2);

    // Format dateTime to timestamp and handle possible midnight rollover.
    formattedArrivalTime = this.formatTime(arrivalTimestampMoment, row);
    formattedDepartureTime = this.formatTime(departureTimestampMoment, row);

    // Minor formatting, as the query will return the departure of a journey as an arrival
    if (row.event_type === 'DEPARTURE' && formattedDepartureTime === null) {
      formattedDepartureTime = formattedArrivalTime;
      formattedArrivalTime = null;
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
    if (formattedDepartureTime !== null && formattedDepartureTime < formattedArrivalTime){
      formattedArrivalTime = formattedDepartureTime;
    }

    // Calculate the TRUST correction indicator total:
    const correctionIndicatorTotal = +row.correction_ind_1 + +row.correction_ind_2;
    return {
      trip_id: row.id,
      arrival_time: (formattedArrivalTime || formattedDepartureTime),
      departure_time: (formattedDepartureTime || formattedArrivalTime),
      scheduled_arrival_time: row.scheduled_arrival_time,
      scheduled_departure_time: row.scheduled_departure_time,
      stop_id: row.crs_code,
      stop_sequence: stopId,
      stop_headsign: row.platform,
      pickup_type: coordinatedDropOff || pickup,
      drop_off_type: coordinatedDropOff || dropOff,
      shape_dist_traveled: null,
      timepoint: 1,
      correctionIndTotal: correctionIndicatorTotal,
      scheduled_location_id: row.stop_id
    };
  }

  private convertActualTimestampToMoment(datetime: string | null) {
    if (datetime===null) {
      return null;
    } else {
      return moment(datetime);
    }
  }

  private formatTime(timeStampMoment: moment.Moment | null, row: ScheduleStopTimeRow) {
    if (timeStampMoment === null) return null;
    const currentStopDepartureHour = parseInt(timeStampMoment.format("H"));

    const eventDateMoment: moment.Moment = moment(row.event_date, "YYYY-MM-DD");
    // We get both date and time from TRUST movement actual_timestamp, therefore we can just use that date to compare
    // with event_date to check if there is a midnight rollover and adjust the timestamp to 48 hour clock accordingly.
    if (timeStampMoment.isAfter(eventDateMoment, 'day') ) {
      return (currentStopDepartureHour + 24) + timeStampMoment.format("HH:mm:ss").substr(2);
    }

    return timeStampMoment.format("HH:mm:ss");
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
