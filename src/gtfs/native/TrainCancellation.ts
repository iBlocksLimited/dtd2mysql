import {TUID} from "./OverlayRecord";
import {CRS} from "../file/Stop";
import {Moment} from "moment";
import {TrainVariationEvent} from "./TrainVariationEvent";

export class TrainCancellation implements TrainVariationEvent{
  constructor(
          public readonly id: number,
          public readonly trainActivationId: number,
          public readonly trainTUID: TUID,
          public readonly trainActivationTime: Moment,
          public readonly eventStationCrsCodes: CRS[],
          public readonly depTimestamp: Moment,
          public readonly cancelType: TrainCancellationType,
          public readonly lastCancellationId: number,
          public readonly cancelOrder: number,
          public readonly schedule_location_id: number | null
  ) {}

}

export enum TrainCancellationType {
  OnCall = "ON CALL",
  AtOrigin = "AT ORIGIN",
  EnRoute = "EN ROUTE",
  OutOfPlan = "OUT OF PLAN"

}



