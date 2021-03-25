import {TUID} from "./OverlayRecord";
import {Moment} from "moment";
import {CRS} from "../file/Stop";

export interface TrainVariationEvent {
  id: number,
  trainActivationId: number,
  trainTUID: TUID,
  trainActivationTime: Moment,
  eventStationCrsCodes: CRS[],
  depTimestamp: Moment,
  lastEventId?: number | null,
  eventOrder?: number | null,
  schedule_location_id?: number | null,
  eventInsertionTime: Moment
}
