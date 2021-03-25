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

      results.on("result", (row: ScheduleStopTimeRow) => {
        if (prevRow && prevRow.id !== row.id) {
          // We enter this if block only if this is the first stop of a new train activation and there is a prev train activation.
          this.schedules.push(this.createScheduleBasedOnSameCIFSchedule(prevRow, stops));
          stops = [];
        }

        const stop = this.createStop(row, stops.length + 1, stops);

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

  private createStop(row: ScheduleStopTimeRow, stopId: number, stops: StopTime[]): StopTime {
    let arrivalTime, departureTime,arrivalTimeWithMoment,departureTimeWithMoment;
    let unadvertisedArrival = false;
    let unadvertisedDeparture = false;

    // Use the real time data
    arrivalTimeWithMoment = this.formatRealTimeStamp(row.actual_timestamp_1);
    departureTimeWithMoment = this.formatRealTimeStamp(row.actual_timestamp_2);

    const originDepartureHour: number = this.findOriginDepartureHour(row, arrivalTimeWithMoment, departureTimeWithMoment, stops);
    arrivalTime = this.formatTime(arrivalTimeWithMoment, originDepartureHour);
    departureTime = this.formatTime(departureTimeWithMoment, originDepartureHour);

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
      trip_id: row.id,
      arrival_time: (arrivalTime || departureTime),
      departure_time: (departureTime || arrivalTime),
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

  /**
   * todo This method will be called X (number of stops for a train activation) times which is not efficient. However
   * it cannot be calculated outside createStop() to avoid the bug that it default the originDepartureHour to 4. Fix
   * when we have time.
   */
  private findOriginDepartureHour(row: ScheduleStopTimeRow, arrivalTimeWithMoment, departureTimeWithMoment, stops: StopTime[]): number {
    //Code below sets the departure hour from the real time data to avoid instances of trains arriving before they leave.
    let originDepartureHour : number;
    if (stops.length > 0) {
      const originStop:StopTime = stops[0];
      originDepartureHour = originStop.departure_time
        ? parseInt(originStop.departure_time.substr(0, 2), 10)
        : originStop.arrival_time
        ? parseInt(originStop.arrival_time.substr(0, 2), 10)
        : originStop.scheduled_departure_time
        ? parseInt(originStop.scheduled_departure_time.substr(0, 2), 10)
        : originStop.scheduled_arrival_time
        ? parseInt(originStop.scheduled_arrival_time.substr(0, 2), 10) : 4;
    } else {
      //If no real time data available, use public arrival/departure time to set departure hour.
      originDepartureHour = arrivalTimeWithMoment
        ? parseInt(arrivalTimeWithMoment.substr(0, 2), 10)
        : departureTimeWithMoment
        ? parseInt(departureTimeWithMoment.substr(0, 2), 10)
        : row.public_departure_time
        ? parseInt(row.public_departure_time.substr(0, 2), 10)
        : row.public_arrival_time
        ? parseInt(row.public_arrival_time.substr(0, 2), 10) : 4;
    }

    return originDepartureHour;
  }

  private formatRealTimeStamp(timeStamp: string | null){
    if (timeStamp===null) {
      return null;
    } else {
      timeStamp = moment(timeStamp).format("HH:mm:ss");
      return timeStamp;
    }
  }

  private formatTime(time: string | null, originDepartureHour: number) {
    if (time === null) return null;

    const currentStopDepartureHour = parseInt(time.substr(0, 2), 10);


    // if the service started after 4am and after the current stops departure hour we've probably rolled over midnight
    if (originDepartureHour >= 4 && originDepartureHour > currentStopDepartureHour) {
      return (currentStopDepartureHour + 24) + time.substr(2);
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
