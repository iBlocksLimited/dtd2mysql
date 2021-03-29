import {TrainCancellation, TrainCancellationType} from "../native/TrainCancellation";
import {Schedule} from "../native/Schedule";
import {StopTime} from "../file/StopTime";
import {TrainReinstatement} from "../native/TrainReinstatement";
import {TrainChangeOfOrigin} from "../native/TrainChangeOfOrigin";
import {TrainVariationEvent} from "../native/TrainVariationEvent";
import * as moment from "moment/moment";

/**
 * Apply train variation events to a train activation with all its movement data.
 * Train variation events include train cancellation, train reinstatement and train change of origin.
 */
export function applyTrainVariationEvents(schedules: Schedule[], trainCancellations: TrainCancellation[],
                                          trainReinstatements: TrainReinstatement[], trainChangeOfOrigin: TrainChangeOfOrigin[]): Schedule[] {
  const resultSchedules: Schedule[] = [];
  const trustScheduleActivationMap: Map<number, Schedule> = convertTrustSchedulesToMap(schedules);
  const cancellationsActivationMap = <Map<number, TrainCancellation[]>>convertTrainVariationEventToMap(trainCancellations);
  const reinstatementActivationMap = <Map<number, TrainReinstatement[]>>convertTrainVariationEventToMap(trainReinstatements);
  const changeOfOriginActivationMap = <Map<number, TrainChangeOfOrigin[]>>convertTrainVariationEventToMap(trainChangeOfOrigin);
  // Clear any cancellation and reinstatement before (in terms of dep_timestamp) change of origin as change of origin cannot be reinstated.
  removeEventsBeforeChangeOfOrigin(cancellationsActivationMap, reinstatementActivationMap, changeOfOriginActivationMap);
  // Use train reinstatement to delete reinstated train cancellations.
  removeReinstatedCancellations(cancellationsActivationMap, reinstatementActivationMap);

  // Apply change of origin, ChangeOfOrigin already deleted any cancellation before it, so any cancellations after it
  // should also be applied to the stop times.
  for (const changeOfOrigins of changeOfOriginActivationMap.values()) {
    changeOfOrigins.sort((a, b) => a.eventInsertionTime.diff(b.eventInsertionTime));
    const latestChangeOfOrigin = changeOfOrigins[changeOfOrigins.length - 1];
    if (trustScheduleActivationMap.has(latestChangeOfOrigin.trainActivationId)) {
      const trustSchedule: Schedule = trustScheduleActivationMap.get(latestChangeOfOrigin.trainActivationId)!
      const stopTimes: StopTime[] = trustSchedule.stopTimes;
      if (stopTimes.length > 0) {
        let findChangeOfOrigin = false;
        for (const [index, stop] of stopTimes.entries()) {
          if (isChangeOfOriginStation(latestChangeOfOrigin, stop)) {
            findChangeOfOrigin = true;
            stop.arrival_time = stop.departure_time;
            stop.pickup_type = 0;
            stop.drop_off_type = 1;
            stopTimes.splice(0, index);
            break;
          }
        }
        // if (!findChangeOfOrigin) {
        //   // todo gtc maybe consider to insert the change of origin station to the first of movement data (there is
        //   //  probably a off-route before first movement which got excluded in the query result), to become the new origin.
        //   console.log(`Cannot find change of origin station for
        //       train change of origin id: ${latestChangeOfOrigin.id}, train activation id: ${latestChangeOfOrigin.trainActivationId}`);
        // }
      }
    }
  }

  // Apply train cancellation.
  for (const trustCancellations of cancellationsActivationMap.values()) {
    const cancellation = trustCancellations.reduce((acc, can) => acc.cancelOrder > can.cancelOrder ? acc : can,
            trustCancellations[0]);
    if (trustScheduleActivationMap.has(cancellation.trainActivationId)) {
      switch (cancellation.cancelType) {
        case TrainCancellationType.OnCall:
          trustScheduleActivationMap.delete(cancellation.trainActivationId);
          break;
        case TrainCancellationType.EnRoute:
        case TrainCancellationType.AtOrigin: {
          const trustSchedule: Schedule = trustScheduleActivationMap.get(cancellation.trainActivationId)!;
          const stopTimes: StopTime[] = trustSchedule.stopTimes;
          if (stopTimes.length > 0) {
            if (isCancellationStation(cancellation, stopTimes[0])) {
              // 1. If the cancellation is the first station, it basically an OnCall cancellation. We remove this movement completely.
              trustScheduleActivationMap.delete(cancellation.trainActivationId);
            } else {
              // 2. If the cancellation is the in-middle (mostly the second to last, the last would be estimated termination station) station, we set that
              // station as the destination station and remove the last termination event.
              let findCancellationStation = false;
              for (const [index, stop] of stopTimes.entries()) {
                if (isCancellationStation(cancellation, stop)) {
                  findCancellationStation = true;
                  stop.departure_time = stop.arrival_time;
                  stop.pickup_type = 1;
                  stop.drop_off_type = 0;
                  stopTimes.splice(index + 1);
                  break;
                }
              }
              // if (!findCancellationStation) {
              //   // todo gtc maybe consider to check cancellation depTimestamp, if the depTimestamp is before the
              //   //  first movement (there is probably a off-route before first movement which got excluded in the query result),
              //   //  we can safely cancel the rest movements (this might be dangerous to do).
              //   console.log(`Cannot find cancellation station for
              //   train cancellation id: ${cancellation.id}, train activation id: ${cancellation.trainActivationId}`);
              // }
            }
          }
          break;
        }
        case TrainCancellationType.OutOfPlan: {
          const trustSchedule: Schedule = trustScheduleActivationMap.get(cancellation.trainActivationId)!;
          const stopTimes: StopTime[] = trustSchedule.stopTimes;
          let findCancellationStation = false;
          for (const [index, stop] of stopTimes.entries()) {
            if (isCancellationStation(cancellation, stop)) {
              findCancellationStation = true;
              stop.departure_time = stop.arrival_time;
              stop.pickup_type = 1;
              stop.drop_off_type = 0;
              stopTimes.splice(index + 1);
              break;
            }
          }
          if (!findCancellationStation) {
            // There is probably an off-route movement before last movement which got excluded in the query result.
            // Therefore we check if the last stop is an estimated stop and if the cancellation depTimeStamp is after
            // second to last stop departure time and before the last stop arrival time.
            // If all true, we replace the estimated destination stop with cancellation stop.
            const lastStop = stopTimes[stopTimes.length - 1]
            const lastStopIsDestination = lastStop.pickup_type === 1 && lastStop.drop_off_type === 0;
            const secondToLastStop = stopTimes[stopTimes.length - 2]
            const eventCrsCode = cancellation.eventStationCrsCodes[0];
            if (eventCrsCode && lastStop && lastStopIsDestination && secondToLastStop && lastStop.correctionIndTotal < 0) {
              const activationDate: string = cancellation.depTimestamp.format('YYYY-MM-DD');
              const secondToLastDepartureTime = convertStopTimeToMoment(activationDate, secondToLastStop.departure_time);
              const lastArrivalTime = convertStopTimeToMoment(activationDate, lastStop.arrival_time);
              const cancellationDepTime = cancellation.depTimestamp;
              if (cancellationDepTime.isSameOrAfter(secondToLastDepartureTime) && cancellationDepTime.isSameOrBefore(lastArrivalTime)) {
                lastStop.arrival_time = cancellation.depTimestamp.format("HH:mm:ss");
                lastStop.departure_time = cancellation.depTimestamp.format("HH:mm:ss");
                lastStop.stop_id = eventCrsCode;
              }
            }
          }
          break;
        }
        default:
          console.warn(`Unseen cancellation type: ${cancellation.cancelType} found for 
            train_cancellation id: ${cancellation.id} train activation id: ${cancellation.trainActivationId}`);
          break;
      }
    }

  }
  for (const schedule of trustScheduleActivationMap.values()) {
    resultSchedules.push(schedule);
  }
  return resultSchedules;
}

export function isCancellationStation(cancellationInfo: TrainCancellation, stop: StopTime): boolean {
  if (cancellationInfo.schedule_location_id == stop.scheduled_location_id) {
    return true;
  }
  return isStation(cancellationInfo, stop);
}

export function isChangeOfOriginStation(changeOfOrigin: TrainChangeOfOrigin, stop: StopTime): boolean {
  return isStation(changeOfOrigin, stop);
}

export function isStation(variationEvent: TrainVariationEvent, stop: StopTime): boolean {
  // The depTimestamp of variation event is always based on train's scheduled departure time.
  if (variationEvent.eventStationCrsCodes.includes(stop.stop_id)) {
    const activationDate: string = variationEvent.depTimestamp.format('YYYY-MM-DD');
    let stopTimeToCompare: moment.Moment | undefined;
    if (stop.scheduled_departure_time) {
      stopTimeToCompare = moment(activationDate + ' ' + stop.scheduled_departure_time);
    } else if (stop.scheduled_arrival_time) {
      stopTimeToCompare = moment(activationDate + ' ' + stop.scheduled_arrival_time);
    } else if (stop.departure_time) {
      stopTimeToCompare = convertStopTimeToMoment(activationDate, stop.departure_time);
    } else if (stop.arrival_time) {
      stopTimeToCompare = convertStopTimeToMoment(activationDate, stop.arrival_time);
    }
    if (stopTimeToCompare) {
      return Math.abs(stopTimeToCompare.diff(variationEvent.depTimestamp, 'seconds')) < 900;
    }
  }
  return false;
}

export function convertStopTimeToMoment(activationDate: string, stopTime: string) {
  let date = moment(activationDate, 'YYYY-MM-DD');
  let hour: number = parseInt(stopTime.substr(0, 2), 10)
  let timeStamp: string;
  if (hour >= 24) {
    date.add(1, 'days');
    hour = hour - 24;
    timeStamp = hour.toLocaleString('en-GB', {minimumIntegerDigits: 2}) + stopTime.substr(2)
  } else {
    timeStamp = stopTime;
  }

  return moment(date.format('YYYY-MM-DD') + ' ' + timeStamp);
}

export function removeReinstatedCancellations(cancellationMap: Map<number, TrainCancellation[]>,
                                              reinstatementMap: Map<number, TrainReinstatement[]>) {
  // Here I loosely check if the crs code matches for reinstatement vs cancellation.
  // In theory I could also check if the dep_timestamp matches.
  const filterNonReinstatedCancellations = (c: TrainCancellation, r: TrainReinstatement) => {
    if (c.eventInsertionTime.isAfter(r.eventInsertionTime)) return true; // reinstatement cannot reinstate future.
    if (c.schedule_location_id && c.schedule_location_id === r.schedule_location_id) return false;
    return !c.eventStationCrsCodes.some(crs => r.eventStationCrsCodes.includes(crs));
  }
  for (const reinstatements of reinstatementMap.values()) {
    for (const reinstatement of reinstatements) {
      if (cancellationMap.has(reinstatement.trainActivationId)) {
        removeVariationsWithCondition(reinstatement, cancellationMap, filterNonReinstatedCancellations)
      }
    }
  }
}

export function removeEventsBeforeChangeOfOrigin(cancellationMap: Map<number, TrainCancellation[]>,
                                                 reinstatementMap: Map<number, TrainReinstatement[]>,
                                                 changeOfOriginMap: Map<number, TrainChangeOfOrigin[]>) {
  const filterLaterEvents = (c: TrainCancellation, coo: TrainChangeOfOrigin) => c.depTimestamp.isAfter(coo.depTimestamp)
  for (const changeOfOrigins of changeOfOriginMap.values()) {
    changeOfOrigins.sort((a, b) => a.eventInsertionTime.diff(b.eventInsertionTime));
    const latestChangeOfOrigin = changeOfOrigins[changeOfOrigins.length - 1];
    if (cancellationMap.has(latestChangeOfOrigin.trainActivationId)) {
      removeVariationsWithCondition(latestChangeOfOrigin, cancellationMap, filterLaterEvents);
    }
    if (reinstatementMap.has(latestChangeOfOrigin.trainActivationId)) {
      removeVariationsWithCondition(latestChangeOfOrigin, reinstatementMap, filterLaterEvents);
    }
  }
}

export function removeVariationsWithCondition(event: TrainVariationEvent, variationsToClean: Map<number, TrainVariationEvent[]>, filterFunc) {
  const variationEvents: TrainVariationEvent[] = variationsToClean.get(event.trainActivationId)!
  const cleanedEvent: TrainVariationEvent[] = variationEvents.filter(c => filterFunc(c, event));
  if (cleanedEvent.length === 0) {
    variationsToClean.delete(event.trainActivationId);
  } else {
    variationsToClean.set(event.trainActivationId, cleanedEvent);
  }
}

export function convertTrustSchedulesToMap(schedules: Schedule[]): Map<number, Schedule> {
  const trustScheduleActivationMap: Map<number, Schedule> = new Map<number, Schedule>();
  for (const schedule of schedules) {
    trustScheduleActivationMap.set(schedule.id, schedule);
  }
  return trustScheduleActivationMap;
}

export function convertTrainVariationEventToMap(trainVariationEvents: TrainVariationEvent[]): Map<number, TrainVariationEvent[]> {
  const trainVariationEventMap: Map<number, TrainVariationEvent[]> = new Map<number, TrainVariationEvent[]>();
  for (const cancellation of trainVariationEvents) {
    if (trainVariationEventMap.has(cancellation.trainActivationId)) {
      trainVariationEventMap.get(cancellation.trainActivationId)!.push(cancellation)
    } else {
      trainVariationEventMap.set(cancellation.trainActivationId, [cancellation])
    }
  }
  return trainVariationEventMap;
}

