import {Schedule} from "../native/Schedule";

/**
 * Remove invalid schedules.
 * Invalid Schedules:
 * 1. Schedule with calendar.runFrom > calendar.runTo (This kind of schedule will break OTP during start up stage).
 */
export function removeInvalidSchedules(schedules: Schedule[]): Schedule[] {
  const result: Schedule[] = [];
  for (const schedule of schedules) {
    if (schedule.calendar.runsFrom.isSameOrBefore(schedule.calendar.runsTo)) {
      result.push(schedule);
    } else {
      console.warn(`Removed invalid schedule (reason: "startDate > endDate"):\n scheduleId: ${schedule.id}, tuid: ${schedule.tuid}, rsid: ${schedule.rsid}, stp:${schedule.stp} calendar: ${JSON.stringify(schedule.calendar)}`)
    }
  }
  return result;
}
