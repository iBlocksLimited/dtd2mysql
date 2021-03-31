
import {Schedule} from "./Schedule";
import {NO_DAYS, OverlapType, ScheduleCalendar} from "./ScheduleCalendar";
import {CRS, Stop} from "../file/Stop";
import {Duration, Moment} from "moment";
import {IdGenerator, OverlayRecord, STP, TUID} from "./OverlayRecord";
import {StopTime} from "../file/StopTime";
import moment = require("moment");
import {formatDuration} from "./Duration";

export class Association implements OverlayRecord {

  constructor(
    public readonly id: number,
    public readonly baseTUID: TUID,
    public readonly assocTUID: TUID,
    public readonly assocLocation: CRS,
    public readonly dateIndicator: DateIndicator,
    public readonly assocType: AssociationType,
    public readonly calendar: ScheduleCalendar,
    public readonly stp: STP
  ) { }

  public get tuid(): TUID {
    return this.baseTUID + "_" + this.assocTUID + "_";
  }

  public get hash(): string {
    return this.tuid + this.assocLocation + this.calendar.binaryDays;
  }

  /**
   * Clone the association with a different calendar
   */
  public clone(calendar: ScheduleCalendar, id: number): Association {
    return new Association(
      id,
      this.baseTUID,
      this.assocTUID,
      this.assocLocation,
      this.dateIndicator,
      this.assocType,
      calendar,
      this.stp
    );
  }

  /**
   * Apply the join or split to the associated schedule. Check for any days that the associated service runs but the
   * association does not and create additional schedules to cover those periods.
   */
  public apply(base: Schedule, assoc: Schedule, idGenerator: IdGenerator): Schedule[] {
    const assocCalendar = this.dateIndicator === DateIndicator.Next ? this.calendar.shiftForward() : this.calendar;
    const schedules = [this.mergeSchedules(base, assoc)];

    // if the associated train starts running before the association, clone the associated schedule for those dates
    if (assoc.calendar.runsFrom.isBefore(assocCalendar.runsFrom)) {
      const before = assoc.calendar.clone(assoc.calendar.runsFrom, assocCalendar.runsFrom.clone().subtract(1, "days"));
      if (before.runsFrom.isSameOrBefore(before.runsTo)) {
        schedules.push(assoc.clone(before, idGenerator.next().value));
      }
    }

    // if the associated train runs after the association has finished, clone the associated schedule for those dates
    if (assoc.calendar.runsTo.isAfter(assocCalendar.runsTo)) {
      const after = assoc.calendar.clone(assocCalendar.runsTo.clone().add(1, "days"), assoc.calendar.runsTo);
      if(after.runsFrom.isSameOrBefore(after.runsTo)) {
        schedules.push(assoc.clone(after, idGenerator.next().value));
      }
    }
    // Remove the create schedules for exclude days process as we are using TRUST real-time data now, if we create schedule for
    // associated excluded days, we will generate incorrect data for the associated schedule.
    // e.g. we are applying association for TRUST schedule on 2021-01-04 and the cif_association has an exclude date 2021-01-01,
    // we cannot just create a new schedule on 2021-01-01.
    return schedules;
  }

  /**
   * Apply the split or join to the given schedules
   */
  private mergeSchedules(base: Schedule, assoc: Schedule): Schedule {
    let tuid: TUID;
    let start: StopTime[];
    let assocStop: StopTime;
    let end: StopTime[];

    if (this.assocType === AssociationType.Split) {
      tuid = base.tuid + "_" + assoc.tuid;

      start = base.before(this.assocLocation);
      assocStop = this.mergeAssociationStop(base.stopAt(this.assocLocation), assoc.stopAt(this.assocLocation));
      end = assoc.after(this.assocLocation);
    }
    else {
      tuid = assoc.tuid + "_" + base.tuid;

      start = assoc.before(this.assocLocation);
      assocStop = this.mergeAssociationStop(assoc.stopAt(this.assocLocation), base.stopAt(this.assocLocation));
      end = base.after(this.assocLocation)
    }

    let stopSequence: number = 1;

    const stops = [
      ...start.map(s => cloneStop(s, stopSequence++, assoc.id)),
      cloneStop(assocStop, stopSequence++, assoc.id),
      ...end.map(s => cloneStop(s, stopSequence++, assoc.id, assocStop))
    ];

    const calendar = this.dateIndicator === DateIndicator.Next ? assoc.calendar.shiftBackward() : assoc.calendar;

    return new Schedule(
      assoc.id,
      stops,
      tuid,
      assoc.rsid,
      // only take the part of the schedule that the association applies to
      calendar.clone(
        moment.max(this.calendar.runsFrom, calendar.runsFrom),
        moment.min(this.calendar.runsTo, calendar.runsTo)
      ),
      assoc.mode,
      assoc.operator,
      assoc.stp,
      assoc.firstClassAvailable,
      assoc.reservationPossible
    )
  }

  /**
   * Take the arrival time of the first stop and the departure time of the second stop and put them into a new stop
   */
  public mergeAssociationStop(arrivalStop: StopTime, departureStop: StopTime): StopTime {

    if(!arrivalStop) {
      debugger;
    }
    if(!departureStop) {
      debugger;
    }
    let arrivalTime = moment.duration(arrivalStop.arrival_time);
    let departureTime = moment.duration(departureStop.departure_time);

    if (arrivalTime.asSeconds() > departureTime.asSeconds()) {
      if (this.dateIndicator === DateIndicator.Next) {
        departureTime.add(1, "days");
      }
      else {
        arrivalTime = moment.duration(departureStop.arrival_time);
      }
    }

    return Object.assign({}, arrivalStop, {
      arrival_time: formatDuration(arrivalTime.asSeconds()),
      departure_time: formatDuration(departureTime.asSeconds()),
      pickup_type: departureStop.pickup_type,
      drop_off_type: arrivalStop.drop_off_type
    });
  }

}

/**
 * Clone the given stop overriding the sequence number and modifying the arrival/departure times if necessary
 */
function cloneStop(stop: StopTime, stopSequence: number, tripId: number, assocStop: StopTime | null = null): StopTime {
  const assocTime = moment.duration(assocStop && assocStop.arrival_time ? assocStop.arrival_time : "00:00");
  const departureTime = stop.departure_time ? moment.duration(stop.departure_time) : undefined;

  if (departureTime && departureTime.asSeconds() < assocTime.asSeconds()) {
    departureTime.add(1, "day");
  }

  const arrivalTime = stop.arrival_time ? moment.duration(stop.arrival_time) : undefined;

  if (arrivalTime && arrivalTime.asSeconds() < assocTime.asSeconds()) {
    arrivalTime.add(1, "day");
  }

  return Object.assign({}, stop, {
    arrival_time: arrivalTime ? formatDuration(arrivalTime.asSeconds()) : undefined,
    departure_time: departureTime ? formatDuration(departureTime.asSeconds()) : undefined,
    stop_sequence: stopSequence,
    trip_id: tripId
  });
}

export enum DateIndicator {
  Same = "SAME_DAY",
  Next = "NEXT_MIDNIGHT",
  Previous = "PREV_MIDNIGHT"
}

export enum AssociationType {
  Split = "DIVIDE",
  Join = "JOIN",
  NA = ""
}
