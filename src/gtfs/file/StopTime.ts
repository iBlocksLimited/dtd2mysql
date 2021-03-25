
import {CRS} from "./Stop";

export interface StopTime {
  trip_id: number;
  arrival_time: string;
  departure_time: string;
  scheduled_arrival_time: string | null;
  scheduled_departure_time: string | null;
  stop_id: CRS;
  stop_sequence: number;
  stop_headsign: Platform;
  pickup_type: 0 | 1 | 2 | 3;
  drop_off_type: 0 | 1 | 2 | 3;
  shape_dist_traveled: null;
  timepoint: 0 | 1;
  correctionIndTotal: number;
  scheduled_location_id: number | null;
}

export type Platform = string;
