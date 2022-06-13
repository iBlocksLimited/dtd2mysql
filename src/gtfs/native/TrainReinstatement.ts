import {TUID} from "./OverlayRecord";
import {CRS} from "../file/Stop";
import {Moment} from "moment";
import {TrainVariationEvent} from "./TrainVariationEvent";

export class TrainReinstatement implements TrainVariationEvent{
  constructor(
          public readonly id: number,
          public readonly trainActivationId: number,
          public readonly trainTUID: TUID,
          public readonly trainActivationTime: Moment,
          public readonly eventStationCrsCodes: CRS[], // why? different CRS code can represent same location, e.g. CTR,XCZ all means Chester
          public readonly depTimestamp: Moment,
          public readonly lastReinstatementId: number,
          public readonly reinstatementOrder: number,
          public readonly schedule_location_id: number | null,
          public readonly eventInsertionTime: Moment,
  ) {}
}
