import {Association, AssociationType, DateIndicator} from "../native/Association";
import {Schedule} from "../native/Schedule";
import {OverlapType, ScheduleCalendar} from "../native/ScheduleCalendar";
import {IdGenerator} from "../native/OverlayRecord";
import {StopTime} from "../file/StopTime";
import moment = require("moment");

/**
 * Iterate through the associations matching association schedules records with base schedules and applying the
 * association as a join or split.
 *
 * Splits prepend the base schedule (0, point of split) to the association schedule
 * Joins append the base schedule (point of split, end) to the association schedule
 */
export function applyAssociations(schedulesByTuid: ScheduleIndex,
                                  associationsIndex: AssociationIndex,
                                  idGenerator: IdGenerator): ScheduleIndex {

  for (const associations of Object.values(associationsIndex)) {
    // for each association
    for (const association of associations) {
      // get the date range for the associated schedules
      const assocCalendar = association.dateIndicator === DateIndicator.Next
        ? association.calendar.shiftForward()
        : association.calendar;

      // get the associated schedules inside the date range of the association
      for (const assocSchedule of findSchedules(schedulesByTuid[association.assocTUID] || [], assocCalendar)) {
        // get the date range for the target base schedule (same or previous day of associated schedule NOT the association)
        const baseCalendar = association.dateIndicator === DateIndicator.Next
          ? assocSchedule.calendar.shiftBackward()
          : assocSchedule.calendar;

        // find the matching base record
        const baseSchedules = findSchedules(schedulesByTuid[association.baseTUID] || [], baseCalendar);

        // We have to check that the association _actually_ goes through the association point, and it is sensible to
        // associate two trains at the association stop.
        if(baseSchedules.length === 0) continue;
        const baseTrainStopTime: StopTime =  baseSchedules[0].stopAt(association.assocLocation);
        const assocTrainStopTime: StopTime = assocSchedule.stopAt(association.assocLocation);
        if (baseTrainStopTime && assocTrainStopTime && isSensibleToAssociate(association, baseTrainStopTime, assocTrainStopTime)) {
          const [replacement, ...associatedSchedules] = association.apply(baseSchedules[0], assocSchedule, idGenerator);

          // add the merged base and associated schedule to the TUID index
          (schedulesByTuid[replacement.tuid] = schedulesByTuid[replacement.tuid] || []).push(replacement);

          // remove the original associated schedule and replace with any substitute schedules created
          schedulesByTuid[assocSchedule.tuid].splice(
                  schedulesByTuid[assocSchedule.tuid].indexOf(assocSchedule), 1, ...associatedSchedules
          );
        }
      }
    }
  }

  return schedulesByTuid;
}

/**
 * Return schedules that overlap with the given calendar
 */
function findSchedules(schedules: Schedule[], calendar: ScheduleCalendar): Schedule[] {
  return schedules.filter(schedule => calendar.getOverlap(schedule.calendar) !== OverlapType.None);
}

/**
 * We want to check if it is sensible to associate two trains together at the association station.
 *
 * For both JOIN and DIVIDE, if one of the trains departs before the other train arrives, then it is impossible to
 * associate these trains, it must be another TRUST data inaccuracy.
 *
 * See SMARTTIS-4304 for more detail.
 *
 * @param association Association detail.
 * @param baseAssociationStop The stop time for the base train at the association stop.
 * @param assocAssociationStop The stop time for the assoc train at the association stop.
 */
function isSensibleToAssociate(association: Association, baseAssociationStop: StopTime, assocAssociationStop: StopTime): boolean {
  let baseTrainArrivalTime = moment.duration(baseAssociationStop.arrival_time);
  let baseTrainDepartureTime = moment.duration(baseAssociationStop.departure_time);
  let assocTrainArrivalTime = moment.duration(assocAssociationStop.arrival_time);
  let assocTrainDepartureTime = moment.duration(assocAssociationStop.departure_time);

  if (association.assocType === AssociationType.Join) {
    // For join, we don't have departure time for the assoc train, we need to ensure the base train's departure time
    // is after the assoc train's arrival time.
    return baseTrainDepartureTime.asSeconds() > assocTrainArrivalTime.asSeconds();
  } else if (association.assocType === AssociationType.Split) {
    // For split, we don't have arrival time assoc train, we need to ensure the assoc train's departure time
    // is after the base train's arrival time.
    return assocTrainDepartureTime.asSeconds() > baseTrainArrivalTime.asSeconds()
  }
  return true;
}

export type ScheduleIndex = {
  [tuid: string]: Schedule[];
}

export type AssociationIndex = {
  [tuid: string]: Association[];
}
