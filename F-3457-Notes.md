#  F-3457 Notes

+ [GTFS Data](#GTFS-data)<br>
+ [Current GTFS Exporter](#Current-GTFS-Exporter)<br>
+ [Realtime GTFS Exporter](#Realtime-GTFS-Exporter)<br>
+ [Examples](#Examples)<br>
+ [Next Step](#Next-Step)<br>
+ [Queries](#Queries)<br>

---
## GTFS Data

Google has a [detailed explanation](https://developers.google.com/transit/gtfs/reference#dataset_files) on GTFS data structure.

Required files for RAPTOR:

* **agency.txt**: train company's information.

* **transfers.txt**: Same station transfer time information.

* **links.txt**: fixed links information. (Empty)

* **stops.txt**: location information.

* **calendar.txt**: Defines how the (train) service is carried out for each weekday. The core principle to this is a that there is only one service running per TUID on any one given day - you can’t have two services with the same TUID running on the same day.
```
service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date
1,0,0,0,0,0,0,1,20201227,20210314
2,0,0,0,0,0,0,1,20201213,20210117
3,0,0,0,0,0,0,1,20210321,20210328
4,0,0,0,0,0,0,1,20201213,20210328
...
```
* **calendar_dates.txt**: Exclude certain date from a (train) service, supplementary data to calendar.txt
```
service_id,date,exception_type
4,20210124,2
4,20210131,2
27,20210131,2
...
```

* **routes.txt**: Defines a train route, there can be multiple trips on 1 route.
```
route_id,agency_id,route_short_name,route_long_name,route_type,route_text_color,route_color,route_url,route_desc
14681527,CS,CS:EDB->CRS,CS train service from EDB to CRS,2,,,,Train. Standard class only. Reservation possible
14673021,CS,CS:GLC->EUS,CS train service from GLC to EUS,2,,,,Train. Standard class only. Reservation possible
...
```
* **trips.txt**: A train trip that is on a certain route, trip * -> 1 route, multiple trips on 1 route.
```
route_id,service_id,trip_id,trip_headsign,trip_short_name,direction_id,wheelchair_accessible,bikes_allowed
14681527,1,14681527,C03890,CS300402,0,0,0
14673021,2,14673021,C03894,CS300401,0,0,0
...
```
* **stop_times.txt**: Arrival and departure times for each stop of 1 trip.
```
trip_id,arrival_time,departure_time,stop_id,stop_sequence,stop_headsign,pickup_type,drop_off_type,shape_dist_traveled,timepoint
14681527,23:15:00,23:15:00,EDB,1,11 ,0,1,,1
14681527,23:18:00,23:18:00,HYM,2,4  ,1,1,,1
14681527,23:20:30,23:20:30,SLA,3,,1,1,,1
14681527,23:43:00,23:43:00,CRS,4,2  ,1,0,,1
...
```

In GTFS a schedule is represented as a trip, and a trip has associated stop times. Each trip also has a
`service_id` that links it to a calendar entry in the `calendar.txt` file, containing a `start_date`,
`end_date` and boolean fields for the days of the week. The `service_id` also links to the `calendar_dates.txt`
which can add or exclude dates from the calendar.

---
## Current GTFS Exporter

### Overview

Our current GTFS exporter takes CIF format data as input. CIF data is based on the concept of overlays. For each train
unique ID (TUID) there will be one or more base schedules with a `stp_indicator` of `P` and these schedules maybe
overridden `O`  or cancelled `C` by other schedules with the same TUID.

The core principle to this is a that there is only one service running per TUID on any one given day - you can’t have
two services with the same TUID running on the same day.

The GTFS itself does not have a concept of schedule overlays, therefore the GTFS exporter will break each schedule
down into multiple possible trips.

For example, if we have 3 schedules for TUID C10000
```
TUID,   STP, start date, end date,   days
C10000, P,   2017-01-01, 2017-12-31, 1111111
C10000, C,   2017-07-15, 2017-07-31, 0000001
C10000, O,   2017-07-01, 2017-07-25, 0000011 (variation on stopping pattern)
```
GTFS exporter will break these schedules into 6 trips:
```
trip ID, start date, end date,   days
1,       2017-01-01, 2017-06-30, 1111111
2,       2017-07-01, 2017-07-25, 1111100
3A,      2017-07-25, 2017-07-31, 1111110
3B,      2017-08-01, 2017-12-31, 1111111
4A,      2017-07-01, 2017-07-14, 0000011
4B,      2017-07-15, 2017-07-25, 0000010
```

In the actual implementation, for short term (<7days) overlays and cancellations, the exporter will simply add the date
into `calendar_dates.txt`, trip splitting only happens for long term variations.

```
ID, start date, end date,   days,    exclude dates
1,  2017-01-01, 2017-12-31, 1111111, Jul-01, Jul-02, Jul-08, Jul-09, Jul-15, Jul-16, Jul-22, Jul-23, Jul-29
2,  2017-07-01, 2017-07-25, 0000011, Jul-16, Jul-23
```

### Association
CIF data also tracks where trains split and join as associations. A cif association record contains a base TUID, associated TUID,
association type (split/join) and a marker to say whether the association happens overnight.

Split:
```
Base schedule: A, B, C, D, E
Associated schedule: C, X, Y, Z
Association: Split at C

Resulting in the associated schedule to become: A, B, C, X, Y, Z
```

Join:
```
Base schedule: A, B, C, D, E
Associated schedule: X, Y, Z, C
Association: Join at C

Resulting in the associated schedule to become: X, Y, Z, C, D, E
```
There is a detailed explanation of how dtd2mysql GTFS exporter works written by the creator [here](https://ljn.io/posts/CIF-to-GTFS).

### Retrieve CIF schedule data

All schedule data are retrieved from `cif_schedule` and `cif_schedule_location` tables from the Delay Repay database:
[Original GetSchedule query](#Original-GetSchedule-query).

The exporter will use public arrival/departure times if they are present, or it will fallback to use scheduled arrival/departure times
and convert them into the `arrival_time` and `departure_time` in `stop_times.txt`.

---
## Realtime GTFS Exporter

### Overview
In Jack and Ed's realtime GTFS exporter, the major update is around the GetSchedule query: [Realtime GetSchedule query](#Realtime-GetSchedule-Query).
They use the `TrainUID` to link a `cif_schedule` entry to a `train_activation` entry, and then link the activation event to a `train_movement` entry,
the actual arrival/departure time (realtime) can be obtained from the movement event. In a single schedule, if the actual
arrival/departure time is missing from the movement event, the exporter will fallback to use public/scheduled time.

After all the schedule data have been retrieved, the afterwards procedures (applying overlay, split/join associations, etc.)
stay unchanged.

In this approach, CIF schedules are still the base of our schedule data, where the schedule locations and the arrival/departure
times have been improved to use the actual locations and times.

### Issues

* Logic issue with supporting multiple days

The exporter does not have specific logic to handle different stop times for 1 1 cif_schedule.


* Running time

`train_movement` table is huge, the query can only run for 1 specific date. Use the query to generate 14 days of data is
impossible. Jack and Ed created a Python script to concatenate the data for multiple days.

* Association

Instead of using cif locations, it uses trust locations. This will introduce the risk that a cif association point might
not exist in the trust data. Resulting in the associations not being handled correctly.


---
## Examples
**Association Case 1 (LNDN490 vs LBG) Split**

select * from cif_association a where a.association_id = 181233; # RAMSGTE
select * from cif_schedule s where s.train_uid = 'P34838';
select * from cif_schedule s where s.train_uid = 'P35755';

select
s.schedule_id,
s.train_uid,
s.wef_date,
s.weu_date,
s.stp_indicator,
sloc.schedule_location_id, sloc.schedule_id, sloc.location_type, sloc.location_order, sloc.tiploc, sloc.scheduled_arrival_time, sloc.scheduled_departure_time,
m.station_name, m.crs_code
from cif_schedule s
left join cif_schedule_location sloc on s.schedule_id = sloc.schedule_id
join master_location m on m.tiploc = sloc.tiploc
where s.train_uid = 'P34838'
and s.schedule_id = 13448244
group by sloc.schedule_location_id
order by sloc.location_order;


select tm.movement_id, tm.actual_timestamp, tm.loc_stanox, tm.planned_timestamp, tm.event_type, m.station_name, m.crs_code, m.tiploc
from train_movement tm
join master_location m on m.stanox = tm.loc_stanox
where tm.activation_id = 35848646
group by tm.loc_stanox
order by tm.actual_timestamp;


**Association Case 2 (L86647 vs L86691) Split**

select * from cif_association a where a.wef_date >= '2021-02-05'
AND a.weu_date <= '2021-02-06';
select * from cif_association a where a.association_id = 181693; # SLSBRY
select * from cif_schedule s where s.train_uid = 'L86647';
select * from cif_schedule s where s.train_uid = 'L86691';

---
## Next Step

#### If CIF+TRUST solution is acceptable
* Update GTFS data exporter to generate a calendar date per train activation date.
* Write Python script to thoroughly examine the realtime GTFS data, compare with CIF GTFS data.
* Optimise query running time to cope with generating 14 days of data.
* Javelin run (?) compare JG result based on CIF GTFS data and realtime GTFS data.
#### If We need a better realtime solution
* Consider Delay Repay's TRUST+Darwin solution.
* Maybe consider writing the exporter in Java.

---
## Queries

### Original GetSchedule query
```mysql
SELECT s.schedule_id                                                   as id,
       s.train_uid,
       e.rsid                                                          as retail_train_id,
       greatest(s.wef_date, COALESCE(s.import_wef_date, s.wef_date))   as runs_from,
       least(s.weu_date, COALESCE(s.import_weu_date, s.weu_date))      as runs_to,
       SUBSTRING(s.valid_days, 1, 1)                                   as monday,
       SUBSTRING(s.valid_days, 2, 1)                                   as tuesday,
       SUBSTRING(s.valid_days, 3, 1)                                   as wednesday,
       SUBSTRING(s.valid_days, 4, 1)                                   as thursday,
       SUBSTRING(s.valid_days, 5, 1)                                   as friday,
       SUBSTRING(s.valid_days, 6, 1)                                   as saturday,
       SUBSTRING(s.valid_days, 7, 1)                                   as sunday,
       loc.crs_code                                                    as crs_code,
       s.stp_indicator                                                 as stp_indicator,
       sloc.public_arrival_time,
       sloc.public_departure_time,
       IF(s.train_status = "S", "SS", s.train_category)                AS train_category,
       IFNULL(sloc.scheduled_arrival_time, sloc.scheduled_pass_time)   AS scheduled_arrival_time,
       IFNULL(sloc.scheduled_departure_time, sloc.scheduled_pass_time) AS scheduled_departure_time,
       sloc.platform,
       e.atoc_code,
       sloc.schedule_location_id                                       AS stop_id,
       COALESCE(sloc.activity, "")                                     as activity,
       s.reservations,
       s.train_class
FROM cif_schedule as s
       LEFT JOIN cif_schedule_extra as e ON e.schedule_id = s.schedule_id
       LEFT JOIN cif_schedule_location as sloc ON sloc.schedule_id = s.schedule_id
       LEFT JOIN master_location as loc ON sloc.tiploc = loc.tiploc

WHERE (sloc.schedule_location_id IS NULL OR (loc.crs_code IS NOT NULL AND loc.crs_code != ""))
  AND s.wef_date < '2021-02-06'
  AND s.weu_date >= '2021-02-05'
  AND (s.import_weu_date IS NULL OR (s.import_weu_date > '2021-02-05'))
  AND (s.schedule_type != 'VSTP')

HAVING runs_to >= runs_from
ORDER BY stp_indicator DESC, s.schedule_id, sloc.location_order
```

### Realtime GetSchedule Query
```mysql
SELECT s.schedule_id                                                   AS id,
       s.train_uid,
       e.rsid                                                          AS retail_train_id,
       greatest(s.wef_date, COALESCE(s.import_wef_date, s.wef_date))   AS runs_from,
       least(s.weu_date, COALESCE(s.import_weu_date, s.weu_date))      AS runs_to,
       SUBSTRING(s.valid_days, 1, 1)                                   AS monday,
       SUBSTRING(s.valid_days, 2, 1)                                   AS tuesday,
       SUBSTRING(s.valid_days, 3, 1)                                   AS wednesday,
       SUBSTRING(s.valid_days, 4, 1)                                   AS thursday,
       SUBSTRING(s.valid_days, 5, 1)                                   AS friday,
       SUBSTRING(s.valid_days, 6, 1)                                   AS saturday,
       SUBSTRING(s.valid_days, 7, 1)                                   AS sunday,
       loc.crs_code                                                    AS crs_code,
       s.stp_indicator                                                 AS stp_indicator,
       sloc.location_order,
       tma.event_type                                                  AS event_type,
       tma.actual_timestamp                                            AS actual_timestamp_1,
       tmd.actual_timestamp                                            AS actual_timestamp_2,
       sloc.public_arrival_time,
       sloc.public_departure_time,
       IF(s.train_status = "S", "SS", s.train_category)                AS train_category,
       IFNULL(sloc.scheduled_arrival_time, sloc.scheduled_pass_time)   AS scheduled_arrival_time,
       IFNULL(sloc.scheduled_departure_time, sloc.scheduled_pass_time) AS scheduled_departure_time,
       sloc.platform,
       e.atoc_code,
       sloc.schedule_location_id                                       AS stop_id,
       COALESCE(sloc.activity, "")                                     AS activity,
       s.reservations,
       s.train_class

FROM cif_schedule AS s
       LEFT JOIN cif_schedule_extra AS e ON e.schedule_id = s.schedule_id
       LEFT JOIN train_activation as ta ON ta.train_uid = s.train_uid
       LEFT JOIN train_movement AS tma ON tma.activation_id = ta.activation_id
                                            AND tma.event_type IN ('ARRIVAL', 'DEPARTURE')
                                            AND tma.offroute_ind IS FALSE
       LEFT JOIN train_movement AS tmd ON ta.activation_id = tmd.activation_id
                                            AND tmd.loc_stanox = tma.loc_stanox
                                            AND (tma.movement_id IS NULL OR
                                                 Coalesce(tmd.schedule_location_id, 1) = Coalesce(tma.schedule_location_id, 1))
                                            AND tmd.event_type != tma.event_type
                                            AND tmd.offroute_ind is FALSE
       LEFT JOIN cif_schedule_location AS sloc ON tma.schedule_location_id = sloc.schedule_location_id
       LEFT JOIN master_location AS loc ON sloc.tiploc = loc.tiploc

WHERE ta.tp_origin_timestamp = "2019-06-18"
  AND (sloc.schedule_location_id IS NULL OR (loc.crs_code IS NOT NULL AND loc.crs_code != ""))
  AND (s.import_weu_date IS NULL OR (s.import_weu_date > "2019-06-18"))
  AND (s.schedule_type != 'VSTP')
  AND sloc.schedule_location_id IS NOT NULL
  AND ((tma.event_type = 'ARRIVAL' AND tmd.event_type IS NULL) OR (tma.event_type = 'DEPARTURE' AND tmd.event_type IS NULL)
         OR (tmd.event_type = 'DEPARTURE' AND tma.event_type = 'ARRIVAL'))
  AND (tma.schedule_location_id = tmd.schedule_location_id OR IF(tmd.schedule_location_id IS NULL, '1', '0') = '1')

HAVING runs_to >= runs_from
ORDER BY stp_indicator DESC, s.schedule_id, sloc.location_order;
```


