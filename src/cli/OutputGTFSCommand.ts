import {CLICommand} from "./CLICommand";
import {CIFRepository} from "../gtfs/repository/CIFRepository";
import {Schedule} from "../gtfs/native/Schedule";
import {agencies} from "../../config/gtfs/agency";
import {Association} from "../gtfs/native/Association";
import {applyOverlays} from "../gtfs/command/ApplyOverlays";
import {mergeSchedules} from "../gtfs/command/MergeSchedules";
import {applyAssociations, AssociationIndex, ScheduleIndex} from "../gtfs/command/ApplyAssociations";
import {createCalendar, ServiceIdIndex} from "../gtfs/command/CreateCalendar";
import {ScheduleResults} from "../gtfs/repository/ScheduleBuilder";
import {GTFSOutput} from "../gtfs/output/GTFSOutput";
import * as fs from "fs";
import {addLateNightServices} from "../gtfs/command/AddLateNightServices";
import {Calendar} from "../gtfs/file/Calendar";
import {CalendarDate} from "../gtfs/file/CalendarDate";

const util = require('util');
const stream = require('stream');
const finished = util.promisify(stream.finished);


export class OutputGTFSCommand implements CLICommand {
  public baseDir: string;

  public constructor(
    private readonly repository: CIFRepository,
    private readonly output: GTFSOutput
  ) {}

  /**
   * Turn the timetable feed into GTFS files
   */
  public async run(argv: string[]): Promise<void> {
    this.baseDir = argv[3] || "./";

    if (!fs.existsSync(this.baseDir)) {
      throw new Error(`Output path ${this.baseDir} does not exist.`);
    }

    const associationsP:Promise<Association[]> = this.repository.getAssociations();
    const scheduleResultsP:Promise<ScheduleResults> = this.repository.getSchedules();
    const transfersP:Promise<void> = this.copy(this.repository.getTransfers(), "transfers.txt");
    const stopsP:Promise<void> = this.copy(this.repository.getStops(), "stops.txt");
    const fixedLinksP:Promise<void> = this.copy(this.repository.getFixedLinks(), "links.txt");
    
    const schedules:Schedule[] = this.getSchedules(await associationsP, await scheduleResultsP);
    const [calendars, calendarDates, serviceIds]:[Calendar[], CalendarDate[], ServiceIdIndex] = createCalendar(schedules);

    const calendarP:Promise<void> = this.copy(calendars, "calendar.txt");
    const calendarDatesP:Promise<void> = this.copy(calendarDates, "calendar_dates.txt");
    const tripsP:Promise<void> = this.copyTrips(schedules, serviceIds);
    const agencyP:Promise<void> = this.copy(agencies, "agency.txt");

    await Promise.all([
      agencyP,
      transfersP,
      stopsP,
      calendarP,
      calendarDatesP,
      tripsP,
      fixedLinksP,
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

    return finished(output);
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
      schedule.stopTimes.forEach(r => stopTimes.write(r));
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
      finished(trips),
      finished(stopTimes),
      finished(routeFile),
    ]);
  }

  private getSchedules(associations: Association[], scheduleResults: ScheduleResults): Schedule[] {
    console.log("association overlays: ", associations.length);
    const processedAssociations = <AssociationIndex>applyOverlays(associations);
    console.log("schedule overlays: ", scheduleResults.schedules.length);
    const processedSchedules = <ScheduleIndex>applyOverlays(scheduleResults.schedules, scheduleResults.idGenerator);
    const associatedSchedules = applyAssociations(processedSchedules, processedAssociations, scheduleResults.idGenerator);
    console.log("merge schedules", Object.keys(associatedSchedules).length)
    const mergedSchedules = <Schedule[]>mergeSchedules(associatedSchedules);
    const schedules = addLateNightServices(mergedSchedules, scheduleResults.idGenerator);

    return schedules;
  }

}
