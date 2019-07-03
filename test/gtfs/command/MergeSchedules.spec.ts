import * as chai from "chai";
import moment = require("moment");
import {STP, TUID} from "../../../src/gtfs/native/OverlayRecord";
import {mergeSchedules} from "../../../src/gtfs/command/MergeSchedules";
import {applyOverlays} from "../../../src/gtfs/command/ApplyOverlays";
import {Days, ScheduleCalendar} from "../../../src/gtfs/native/ScheduleCalendar";
import {StopTime} from "../../../src/gtfs/file/StopTime";
import {Schedule} from "../../../src/gtfs/native/Schedule";
import {RouteType} from "../../../src/gtfs/file/Route";
import { CRS } from "../../../src/gtfs/file/Stop";

describe("MergeSchedules", () => {

  it("merges schedules where they are the same", () => {
    const baseSchedules = [
      schedule(1, "A", "2017-01-01", "2017-01-31", STP.Permanent),
      schedule(2, "A", "2017-02-01", "2017-02-28", STP.Permanent),
      schedule(3, "B", "2017-01-02", "2017-03-15", STP.Permanent),
      schedule(4, "A", "2017-01-15", "2017-02-15", STP.Overlay),
    ];

    const schedules = mergeSchedules(applyOverlays(baseSchedules));

    chai.expect(schedules[0].calendar.runsFrom.isSame("20170101")).to.be.true;
    chai.expect(schedules[0].calendar.runsTo.isSame("20170228")).to.be.true;
    chai.expect(schedules[1].calendar.runsFrom.isSame("20170102")).to.be.true;
    chai.expect(schedules[1].calendar.runsTo.isSame("20170315")).to.be.true;
  });


  it('takes into account passanger activity when deciding to merge', () => {
    let stops = [
      stop(1, "ASH", "00:35"),
      stop(2, "DOV", "01:00"),
    ];

    let stopsWithoutActivities = stops.map(stop => {
      let stopCopy = Object.assign({}, stop, {
        pickup_type: 1,
         drop_off_type: 1
      });
      return stopCopy
    });

    let baseSchedule = schedule(1, "A", "2017-01-02", "2017-01-15", STP.Permanent, ALL_DAYS, stops);
    let overlaySchedule = schedule(2, "A", "2017-01-02", "2017-01-08", STP.Overlay, ALL_DAYS, stopsWithoutActivities);

    const rawSchedules = [
      baseSchedule,
      overlaySchedule
    ];

    const schedules = mergeSchedules(applyOverlays(rawSchedules));
    
    chai.expect(schedules).to.have.lengthOf(2);

  })

});

const ALL_DAYS: Days = { 0: 1, 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 1 };

export function schedule(id: number,
                         tuid: TUID,
                         from: string,
                         to: string,
                         stp: STP = STP.Overlay,
                         days: Days = ALL_DAYS,
                         stops: StopTime[] = []): Schedule {

  return new Schedule(
    id,
    stops,
    tuid,
    "",
    new ScheduleCalendar(
      moment(from),
      moment(to),
      days,
      {}
    ),
    RouteType.Rail,
    "LN",
    stp,
    true,
    true
  );
}

export function stop(stopSequence: number, location: CRS, time: string): StopTime {
  return {
    trip_id: 1,
    arrival_time: time,
    departure_time: time + ":30",
    stop_id: location,
    stop_sequence: stopSequence,
    stop_headsign: "",
    pickup_type: 0,
    drop_off_type: 0,
    shape_dist_traveled: null,
    timepoint: 0,
  };
}
