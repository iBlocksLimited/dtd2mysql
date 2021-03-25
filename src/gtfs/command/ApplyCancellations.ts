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
    changeOfOrigins.sort((a, b) => a.changeOfOriginInsertedTime.diff(b.changeOfOriginInsertedTime));
    const latestChangeOfOrigin = changeOfOrigins[changeOfOrigins.length - 1];
    if (trustScheduleActivationMap.has(latestChangeOfOrigin.trainActivationId)) {
      const trustSchedule: Schedule = trustScheduleActivationMap.get(latestChangeOfOrigin.trainActivationId)!
      const stopTimes: StopTime[] = trustSchedule.stopTimes;
      if (stopTimes.length > 0) {
        let foundChangeOfOrigin = false;
        for (const [index, stop] of stopTimes.entries()) {
          if (isChangeOfOriginStation(latestChangeOfOrigin, stop)) {
            foundChangeOfOrigin = true;
            stop.arrival_time = stop.departure_time;
            stop.pickup_type = 0;
            stop.drop_off_type = 1;
            stopTimes.splice(0, index);
            break;
          }
        }
        if (!foundChangeOfOrigin) {
          // todo gtc maybe consider to insert the change of origin station to the first of movement data to
          //  become the new origin.
          console.log(`Cannot find change of origin station for 
              train change of origin id: ${latestChangeOfOrigin.id}, train activation id: ${latestChangeOfOrigin.trainActivationId}`)
        }
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
        case TrainCancellationType.AtOrigin:
          const trustSchedule: Schedule = trustScheduleActivationMap.get(cancellation.trainActivationId)!;
          const stopTimes: StopTime[] = trustSchedule.stopTimes;
          if (stopTimes.length > 0) {
            if (isCancellationStation(cancellation, stopTimes[0])) {
              // 1. If the cancellation is the first station, it basically an OnCall cancellation. We remove this movement completely.
              trustScheduleActivationMap.delete(cancellation.trainActivationId);
            } else {
              // 2. If the cancellation is the in-middle (mostly the second to last, the last would be estimated termination station) station, we set that
              // station as the destination station and remove the last termination event.
              let foundCancellation = false;
              for (const [index, stop] of stopTimes.entries()) {
                if (isCancellationStation(cancellation, stop)) {
                  foundCancellation = true;
                  stop.departure_time = stop.arrival_time;
                  stop.pickup_type = 1;
                  stop.drop_off_type = 0;
                  stopTimes.splice(index + 1);
                  break;
                }
              }
              if (!foundCancellation) {
                // todo gtc maybe consider to check cancellation depTimestamp, if the depTimestamp is before the
                //  first movement, we can safely cancel the rest movements.
                console.log(`Cannot find cancellation station for 
                train cancellation id: ${cancellation.id}, train activation id: ${cancellation.trainActivationId}`)
              }
            }
          }
          break;
        case TrainCancellationType.OutOfPlan:
          // todo gtc don't know what to do!
          break;
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
      let departureHour: number = parseInt(stop.departure_time.substr(0, 2), 10)
      let timeToCompare: string = departureHour >= 24 ? departureHour - 24 + stop.departure_time.substr(2) : stop.departure_time;
      stopTimeToCompare = moment(activationDate + ' ' + timeToCompare);
    } else if (stop.arrival_time) {
      let arrivalHour: number = parseInt(stop.arrival_time.substr(0, 2), 10);
      let timeToCompare: string = arrivalHour >= 24 ? arrivalHour - 24 + stop.departure_time.substr(2) : stop.departure_time;
      stopTimeToCompare = moment(activationDate + ' ' + timeToCompare);
    }

    if (stopTimeToCompare) {
      return Math.abs(stopTimeToCompare.diff(variationEvent.depTimestamp, 'seconds')) < 900;
    }
  }
  return false;
}

export function removeReinstatedCancellations(cancellationMap: Map<number, TrainCancellation[]>,
                                              reinstatementMap: Map<number, TrainReinstatement[]>) {
  // Here I loosely check if the crs code matches for reinstatement vs cancellation.
  // In theory I could also check if (1) the dep_timestamp matches, (2) if reinstatement insertion time is after
  // cancellation insertion time.
  const filterReinstatedCancellations = (c: TrainCancellation, r: TrainReinstatement) => {
    if (c.schedule_location_id === r.schedule_location_id) {
      return false;
    }
    return !c.eventStationCrsCodes.some(crs => r.eventStationCrsCodes.includes(crs));
  }
  for (const reinstatements of reinstatementMap.values()) {
    for (const reinstatement of reinstatements) {
      if (cancellationMap.has(reinstatement.trainActivationId)) {
        removeVariationsWithCondition(reinstatement, cancellationMap, filterReinstatedCancellations)
      }
    }
  }
}

export function removeEventsBeforeChangeOfOrigin(cancellationMap: Map<number, TrainCancellation[]>,
                                                 reinstatementMap: Map<number, TrainReinstatement[]>,
                                                 changeOfOriginMap: Map<number, TrainChangeOfOrigin[]>) {
  const filterLaterEvents = (c: TrainCancellation, coo: TrainChangeOfOrigin) => c.depTimestamp.isAfter(coo.depTimestamp)
  for (const changeOfOrigins of changeOfOriginMap.values()) {
    changeOfOrigins.sort((a, b) => a.changeOfOriginInsertedTime.diff(b.changeOfOriginInsertedTime));
    const latestChangeOfOrigin = changeOfOrigins[changeOfOrigins.length - 1];
    if (cancellationMap.has(latestChangeOfOrigin.trainActivationId)) {
      removeVariationsWithCondition(latestChangeOfOrigin, cancellationMap, filterLaterEvents);
    }
    if (reinstatementMap.has(latestChangeOfOrigin.trainActivationId)) {
      removeVariationsWithCondition(latestChangeOfOrigin, reinstatementMap, filterLaterEvents);
    }
  }
}

export function removeVariationsWithCondition(event: TrainVariationEvent, variationMap: Map<number, TrainVariationEvent[]>, filterFunc) {
  const variationEvents: TrainVariationEvent[] = variationMap.get(event.trainActivationId)!
  const cleanedEvent: TrainVariationEvent[] = variationEvents.filter(c => filterFunc(c, event));
  if (cleanedEvent.length === 0) {
    variationMap.delete(event.trainActivationId);
  } else {
    variationMap.set(event.trainActivationId, cleanedEvent);
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

