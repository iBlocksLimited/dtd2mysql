import {CLICommand} from "./CLICommand";
import {CIFRepository} from "../gtfs/repository/CIFRepository";
import {Schedule} from "../gtfs/native/Schedule";
import {agencies} from "../../config/gtfs/agency";
import {Association} from "../gtfs/native/Association";
import {applyOverlays, convertToOverlayIndex} from "../gtfs/command/ApplyOverlays";
import {mergeSchedules} from "../gtfs/command/MergeSchedules";
import {applyAssociations, AssociationIndex, ScheduleIndex} from "../gtfs/command/ApplyAssociations";
import {createCalendar, ServiceIdIndex} from "../gtfs/command/CreateCalendar";
import {ScheduleResults} from "../gtfs/repository/ScheduleBuilder";
import {GTFSOutput} from "../gtfs/output/GTFSOutput";
import * as fs from "fs";
import {addLateNightServices} from "../gtfs/command/AddLateNightServices";
import streamToPromise = require("stream-to-promise");
import {Calendar} from "../gtfs/file/Calendar";
import {CalendarDate} from "../gtfs/file/CalendarDate";
import {TrainCancellation} from "../gtfs/native/TrainCancellation";
import {
  applyTrainVariationEvents
} from "../gtfs/command/ApplyCancellations";
import {TrainReinstatement} from "../gtfs/native/TrainReinstatement";
import {TrainChangeOfOrigin} from "../gtfs/native/TrainChangeOfOrigin";
import {IdGenerator} from "../gtfs/native/OverlayRecord";
import {FeedInfo} from "../gtfs/file/FeedInfo";

export class OutputGTFSCommand implements CLICommand {
  public baseDir: string;

  public constructor(
          private readonly repository: CIFRepository,
          private readonly output: GTFSOutput
  ) {
  }

  /**
   * Turn the timetable feed into GTFS files
   */
  public async run(argv: string[]): Promise<void> {
    this.baseDir = argv[3] || "./";

    if (!fs.existsSync(this.baseDir)) {
      throw new Error(`Output path ${this.baseDir} does not exist.`);
    }
    const associationsP: Promise<Association[]> = this.repository.getAssociations();
    const scheduleResultsP: Promise<ScheduleResults> = this.repository.getSchedules();
    const transfersP: Promise<void> = this.copy(this.repository.getTransfers(), "transfers.txt");
    const stopsP: Promise<void> = this.copy(this.repository.getStops(), "stops.txt");
    const fixedLinksP: Promise<void> = this.copy(this.repository.getFixedLinks(), "links.txt");
    let schedules: Schedule[];
    if (this.repository.isExcludeCancelledMovements()) {
      console.log("ExcludeCancelledMovements is set to true, will load and apply real-time train variation events  now.")
      const trainCancellationsP: Promise<TrainCancellation[]> = this.repository.getTrainCancellation();
      const trainReinstatementP: Promise<TrainReinstatement[]> = this.repository.getTrainReinstatement();
      const trainChangeOfOriginP: Promise<TrainChangeOfOrigin[]> = this.repository.getTrainChangeOfOrigin();
      schedules = this.getSchedulesWithCancellationApplied(await associationsP, await trainCancellationsP, await trainReinstatementP,
              await trainChangeOfOriginP, await scheduleResultsP);
    } else {
      console.log("ExcludeCancelledMovements is set to false, will ignore real-time train variation events. ")
      schedules = this.getSchedules(await associationsP, await scheduleResultsP);
    }
    const [calendars, calendarDates, serviceIds]: [Calendar[], CalendarDate[], ServiceIdIndex] = createCalendar(schedules);

    const calendarP: Promise<void> = this.copy(calendars, "calendar.txt");
    const calendarDatesP: Promise<void> = this.copy(calendarDates, "calendar_dates.txt");
    const tripsP: Promise<void> = this.copyTrips(schedules, serviceIds);
    const agencyP: Promise<void> = this.copy(agencies, "agency.txt");

    const feedInfo:FeedInfo[] = [this.getFeedInfo()];
    const feedInfoP: Promise<void> = this.copy(feedInfo, "feed_info.txt");

    await Promise.all([
      agencyP,
      transfersP,
      stopsP,
      calendarP,
      calendarDatesP,
      tripsP,
      fixedLinksP,
      feedInfoP,
      this.repository.end(),
      this.output.end()
    ]);
  }

  /**
   * Map SQL records to a file
   */
  private async copy(results: object[] | Promise<object[]>, filename: string): Promise<void> {
    const rows = await results;
    const output = this.output.open(this.baseDir + filename);

    console.log("Writing " + filename);
    rows.forEach(row => output.write(row));
    output.end();

    return streamToPromise(output);
  }

  /**
   * trips.txt, stop_times.txt and routes.txt have interdependencies so they are written together
   */
  private copyTrips(schedules: Schedule[], serviceIds: ServiceIdIndex): Promise<any> {
    console.log("Writing trips.txt, stop_times.txt and routes.txt");
    const trips = this.output.open(this.baseDir + "trips.txt");
    const stopTimes = this.output.open(this.baseDir + "stop_times.txt");
    const routeFile = this.output.open(this.baseDir + "routes.txt");
    const routes = {};

    for (const schedule of schedules) {
      const route = schedule.toRoute();
      routes[route.route_short_name] = routes[route.route_short_name] || route;
      const routeId = routes[route.route_short_name].route_id;
      const serviceId = serviceIds[schedule.calendar.id];

      trips.write(schedule.toTrip(serviceId, routeId));
      schedule.stopTimes.forEach(r => {
        delete r.correctionIndTotal;
        delete r.scheduled_arrival_time;
        delete r.scheduled_departure_time;
        delete r.scheduled_location_id;
        stopTimes.write(r)
      });
    }

    let knownAgencies: string[] = agencies.map(agency => agency.agency_id);
    for (const route of Object.values(routes)) {
      routeFile.write(route);

      // In case we have new agency in the routes that doesn't exist in our agencies list, we create the agency with default info.
      if (!knownAgencies.includes(route['agency_id'])) {
        const createdAgency = {
          agency_id: route['agency_id'],
          agency_name: `${route['agency_id']} operator`,
          agency_url: "https://www.google.com",
          agency_timezone: "Europe/London",
          agency_lang: "en",
          agency_phone: "",
          agency_fare_url: null
        };
        agencies.splice(-1, 0, createdAgency);
        knownAgencies.push(route['agency_id']);
      }
    }

    trips.end();
    stopTimes.end();
    routeFile.end();

    return Promise.all([
      streamToPromise(trips),
      streamToPromise(stopTimes),
      streamToPromise(routeFile),
    ]);
  }

  // todo gtc really need to change all the legacy CIF terminology 'schedule' to 'train activation' or 'trust pattern' or 'trust movement pattern'
  private getSchedules(associations: Association[], scheduleResults: ScheduleResults): Schedule[] {
    return this.calculateSchedules(associations, scheduleResults.schedules, scheduleResults.idGenerator);
  }

  private getSchedulesWithCancellationApplied(associations: Association[], trainCancellations: TrainCancellation[], trainReinstatement: TrainReinstatement[],
                       trainChangeOfOrigin: TrainChangeOfOrigin[], scheduleResults: ScheduleResults): Schedule[] {
    const schedulesWithCancellationApplied: Schedule[] = applyTrainVariationEvents(scheduleResults.schedules,
            trainCancellations, trainReinstatement, trainChangeOfOrigin);
    return this.calculateSchedules(associations, schedulesWithCancellationApplied, scheduleResults.idGenerator);
  }

  private calculateSchedules(associations: Association[], schedules: Schedule[], idGenerator: IdGenerator): Schedule[] {
    console.log("association overlays: ", associations.length);
    const processedAssociations = <AssociationIndex>applyOverlays(associations);
    console.log("schedule overlays: ", schedules.length);
    const processedSchedules = <ScheduleIndex>convertToOverlayIndex(schedules);
    const associatedSchedules = applyAssociations(processedSchedules, processedAssociations, idGenerator);
    console.log("merge schedules", associatedSchedules.length)
    const mergedSchedules = <Schedule[]>mergeSchedules(associatedSchedules);
    return mergedSchedules;

  }

  private getFeedInfo(): FeedInfo{
    const creationDate = new Date().toISOString().split('.')[0]+"Z";
    const startDate = new Date(this.repository.startDate).toISOString().substring(0,10);
    const endDate = new Date(this.repository.endDate).toISOString().substring(0,10);
    const feedInfo = {
      feed_publisher_name: "iblocks",
      feed_publisher_url: "iblocks.co.uk",
      feed_lang: "English",
      feed_start_date: startDate,
      feed_end_date: endDate,
      feed_version: creationDate
    };
    return feedInfo;
  }

}
