
import {Map} from 'immutable';
import Record from "../../../feed/record/Record";
import ZeroFillInt from "../../../feed/field/ZeroFillInt";
import DateField from "../../../feed/field/DateField";
import Int from "../../../feed/field/Int";
import Text from "../../../feed/field/Text";
import MultiRecordFile from "../../../feed/file/MultiRecordFile";

const pkg = new Record(
    "package",
    ["package_code", "end_date"],
    Map({
        "package_code": new Text(1, 3),
        "end_date": new DateField(4),
        "start_date": new DateField(12),
        "quote_date": new DateField(20),
        "restriction_code": new Text(28, 2),
        "origin_facilities": new Text(30, 26),
        "destination_facilities": new Text(56, 26)
    })
);

const supplement = new Record(
    "package_supplement",
    ["package_code", "end_date", "supplement_code"],
    Map({
        "package_code": new Text(1, 3),
        "end_date": new DateField(4),
        "supplement_code": new Text(12, 3),
        "direction": new Text(15, 1),
        "pack_number": new Text(16, 3),
        "origin_facility": new Text(19, 1, true),
        "dest_facility": new Text(20, 1, true)
    })
);

const TPK = new MultiRecordFile(Map({
    "P": pkg,
    "S": supplement
}), 0);

export default TPK;