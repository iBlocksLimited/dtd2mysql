
DROP TABLE IF EXISTS `timetable_connection`;
CREATE TABLE `timetable_connection` (
  `departure_time` TIME DEFAULT NULL,
  `arrival_time` TIME DEFAULT NULL,
  `origin` char(3) NOT NULL,
  `destination` char(3) NOT NULL,
  `service` VARCHAR(26) NOT NULL,
  `monday` TINYINT(1) NOT NULL,
  `tuesday` TINYINT(1) NOT NULL,
  `wednesday` TINYINT(1) NOT NULL,
  `thursday` TINYINT(1) NOT NULL,
  `friday` TINYINT(1) NOT NULL,
  `saturday` TINYINT(1) NOT NULL,
  `sunday` TINYINT(1) NOT NULL,
  `start_date` DATE NOT NULL,
  `end_date` DATE NOT NULL,
  `operator` CHAR(2),
  `type` varchar(5),
  `dummy` char(3) DEFAULT '---',
  `dummy2` TIME DEFAULT NULL,
  PRIMARY KEY (`departure_time`,`arrival_time`,`origin`,`destination`,`service`, `end_date`),
  KEY `start_date` (`start_date`),
  KEY `end_date` (`end_date`),
  KEY `origin` (`origin`),
  KEY `monday` (`monday`),
  KEY `tuesday` (`tuesday`),
  KEY `wednesday` (`wednesday`),
  KEY `thursday` (`thursday`),
  KEY `friday` (`friday`),
  KEY `saturday` (`saturday`),
  KEY `sunday` (`sunday`),
  KEY `destination` (`destination`),
  KEY `arrival_time` (`arrival_time`),
  KEY `departure_time` (`departure_time`),
  KEY `service` (`service`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

DROP TABLE IF EXISTS `interchange`;
CREATE TABLE `interchange` (
  `station` char(3) NOT NULL,
  `duration` int(11) unsigned NOT NULL,
  PRIMARY KEY (`station`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

DROP TABLE IF EXISTS `group_station`;
CREATE TABLE `group_station` (
  `group_nlc` char(4) NOT NULL,
  `member_crs` char(3) NOT NULL,
  PRIMARY KEY (`group_nlc`, `member_crs`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

INSERT INTO group_station VALUES
  ("0032","LBG"),
  ("0032","LST"),
  ("0032","KGX"),
  ("0032","CHX"),
  ("0032","WAT"),
  ("0032","FST"),
  ("0032","MYB"),
  ("0032","VXH"),
  ("0032","EUS"),
  ("0032","PAD"),
  ("0032","CST"),
  ("0032","VIC"),
  ("0032","MOG"),
  ("0032","STP"),
  ("0032","BFR"),
  ("0032","CTK"),
  ("0032","WAE"),
  ("0033","STP"),
  ("0033","BFR"),
  ("0033","CTK"),
  ("0033","WAE"),
  ("0033","LBG"),
  ("0033","LST"),
  ("0033","KGX"),
  ("0033","EAL"),
  ("0033","CHX"),
  ("0033","WAT"),
  ("0033","FST"),
  ("0033","MYB"),
  ("0033","VXH"),
  ("0033","EUS"),
  ("0033","PAD"),
  ("0033","CST"),
  ("0033","VIC"),
  ("0033","MOG"),
  ("0034","STP"),
  ("0034","BFR"),
  ("0034","CTK"),
  ("0034","WAE"),
  ("0034","LBG"),
  ("0034","LST"),
  ("0034","KGX"),
  ("0034","EAL"),
  ("0034","CHX"),
  ("0034","WAT"),
  ("0034","FST"),
  ("0034","MYB"),
  ("0034","VXH"),
  ("0034","EUS"),
  ("0034","PAD"),
  ("0034","CST"),
  ("0034","VIC"),
  ("0034","MOG"),
  ("0035","EUS"),
  ("0035","PAD"),
  ("0035","CST"),
  ("0035","VIC"),
  ("0035","MOG"),
  ("0035","STP"),
  ("0035","BFR"),
  ("0035","CTK"),
  ("0035","WAE"),
  ("0035","LBG"),
  ("0035","LST"),
  ("0035","KGX"),
  ("0035","CHX"),
  ("0035","WAT"),
  ("0035","FST"),
  ("0035","MYB"),
  ("0035","VXH"),
  ("0038","BKG"),
  ("0038","KPA"),
  ("0038","WHD"),
  ("0038","NXG"),
  ("0038","WIM"),
  ("0038","SRA"),
  ("0038","NWX"),
  ("0051","VXH"),
  ("0051","EUS"),
  ("0051","PAD"),
  ("0051","CST"),
  ("0051","VIC"),
  ("0051","MOG"),
  ("0051","STP"),
  ("0051","BFR"),
  ("0051","CTK"),
  ("0051","WAE"),
  ("0051","LBG"),
  ("0051","LST"),
  ("0051","KGX"),
  ("0051","CHX"),
  ("0051","WAT"),
  ("0051","FST"),
  ("0051","MYB"),
  ("0052","NWX"),
  ("0052","HOH"),
  ("0052","TOM"),
  ("0052","BKG"),
  ("0052","WHD"),
  ("0052","SRU"),
  ("0052","NXG"),
  ("0052","WIM"),
  ("0052","FPK"),
  ("0052","SRA"),
  ("0053","SRA"),
  ("0053","HOH"),
  ("0053","EAL"),
  ("0053","RMD"),
  ("0054","BKG"),
  ("0054","HOH"),
  ("0054","GFD"),
  ("0055","HOH"),
  ("0055","SRU"),
  ("0057","GFD"),
  ("0057","BKG"),
  ("0057","HOH"),
  ("0059","UPM"),
  ("0059","RIC"),
  ("0060","MYB"),
  ("0060","VXH"),
  ("0060","EUS"),
  ("0060","PAD"),
  ("0060","CST"),
  ("0060","VIC"),
  ("0060","MOG"),
  ("0060","STP"),
  ("0060","BFR"),
  ("0060","CTK"),
  ("0060","WAE"),
  ("0060","LBG"),
  ("0060","LST"),
  ("0060","EAL"),
  ("0060","KGX"),
  ("0060","CHX"),
  ("0060","WAT"),
  ("0060","FST"),
  ("0061","HOH"),
  ("0061","SRU"),
  ("0062","GFD"),
  ("0062","BKG"),
  ("0062","HOH"),
  ("0063","HOH"),
  ("0063","SRU"),
  ("0063","NWX"),
  ("0063","SRA"),
  ("0063","TOM"),
  ("0063","BKG"),
  ("0063","WHD"),
  ("0063","NXG"),
  ("0063","WIM"),
  ("0063","FPK"),
  ("0064","CHX"),
  ("0064","WAT"),
  ("0064","FST"),
  ("0064","MYB"),
  ("0064","VXH"),
  ("0064","EUS"),
  ("0064","PAD"),
  ("0064","CST"),
  ("0064","VIC"),
  ("0064","MOG"),
  ("0064","STP"),
  ("0064","BFR"),
  ("0064","CTK"),
  ("0064","WAE"),
  ("0064","LBG"),
  ("0064","LST"),
  ("0064","EAL"),
  ("0064","KGX"),
  ("0065","EAL"),
  ("0065","KGX"),
  ("0065","CHX"),
  ("0065","WAT"),
  ("0065","FST"),
  ("0065","MYB"),
  ("0065","VXH"),
  ("0065","EUS"),
  ("0065","PAD"),
  ("0065","CST"),
  ("0065","VIC"),
  ("0065","MOG"),
  ("0065","STP"),
  ("0065","BFR"),
  ("0065","CTK"),
  ("0065","WAE"),
  ("0065","LBG"),
  ("0065","LST"),
  ("0066","HOH"),
  ("0066","SRU"),
  ("0066","NWX"),
  ("0066","SRA"),
  ("0066","TOM"),
  ("0066","BKG"),
  ("0066","WHD"),
  ("0066","NXG"),
  ("0066","WIM"),
  ("0066","FPK"),
  ("0067","RMD"),
  ("0067","EAL"),
  ("0067","HOH"),
  ("0067","SRU"),
  ("0067","SRA"),
  ("0068","GFD"),
  ("0068","HOH"),
  ("0068","SRU"),
  ("0068","BKG"),
  ("0069","HOH"),
  ("0069","SRU"),
  ("0070","RIC"),
  ("0070","UPM"),
  ("0254","CET"),
  ("0254","COL"),
  ("0258","CFB"),
  ("0258","CTF"),
  ("0259","EBR"),
  ("0259","EBT"),
  ("0260","FNN"),
  ("0260","FNB"),
  ("0262","PNE"),
  ("0262","PNW"),
  ("0263","ENC"),
  ("0263","ENF"),
  ("0265","WHD"),
  ("0265","WHP"),
  ("0268","PFM"),
  ("0268","PFR"),
  ("0271","TNN"),
  ("0271","TNS"),
  ("0403","RDG"),
  ("0403","RDW"),
  ("0404","HLC"),
  ("0404","HLU"),
  ("0410","BSJ"),
  ("0410","BDM"),
  ("0411","SOV"),
  ("0411","SOC"),
  ("0413","HFN"),
  ("0413","HFE"),
  ("0414","DVP"),
  ("0415","GNB"),
  ("0415","GBL"),
  ("0416","DKT"),
  ("0416","DPD"),
  ("0416","DKG"),
  ("0418","BSW"),
  ("0418","BHM"),
  ("0418","BMO"),
  ("0424","BDI"),
  ("0424","BDQ"),
  ("0428","CBE"),
  ("0428","CBW"),
  ("0429","DCH"),
  ("0429","DCW"),
  ("0431","FKK"),
  ("0431","FKG"),
  ("0432","FKC"),
  ("0432","FKW"),
  ("0433","GLQ"),
  ("0433","GLC"),
  ("0435","LVC"),
  ("0435","LVJ"),
  ("0435","LIV"),
  ("0435","MRF"),
  ("0437","MDW"),
  ("0437","MDE"),
  ("0437","MDB"),
  ("0438","DGT"),
  ("0438","MCO"),
  ("0438","MAN"),
  ("0438","MCV"),
  ("0440","PMS"),
  ("0440","PMH"),
  ("0441","NCT"),
  ("0441","NNG"),
  ("0443","TYL"),
  ("0443","UTY"),
  ("0444","WKK"),
  ("0444","WKF"),
  ("0445","WBQ"),
  ("0445","WAC"),
  ("0446","WGN"),
  ("0446","WGW"),
  ("0447","WOS"),
  ("0447","WOF"),
  ("0449","WCY"),
  ("0449","ECR"),
  ("0785","LBG"),
  ("0785","LST"),
  ("0785","KGX"),
  ("0785","CHX"),
  ("0785","WAT"),
  ("0785","FST"),
  ("0785","MYB"),
  ("0785","VXH"),
  ("0785","OLD"),
  ("0785","EUS"),
  ("0785","PAD"),
  ("0785","CST"),
  ("0785","VIC"),
  ("0785","MOG"),
  ("0785","STP"),
  ("0785","BFR"),
  ("0785","CTK"),
  ("0785","WAE"),
  ("0786","STP"),
  ("0786","BFR"),
  ("0786","CTK"),
  ("0786","WAE"),
  ("0786","LBG"),
  ("0786","LST"),
  ("0786","EAL"),
  ("0786","KGX"),
  ("0786","CHX"),
  ("0786","WAT"),
  ("0786","FST"),
  ("0786","MYB"),
  ("0786","VXH"),
  ("0786","EUS"),
  ("0786","PAD"),
  ("0786","CST"),
  ("0786","VIC"),
  ("0786","MOG"),
  ("0790","STP"),
  ("0790","BFR"),
  ("0790","CTK"),
  ("0790","WAE"),
  ("0790","LBG"),
  ("0790","LST"),
  ("0790","KGX"),
  ("0790","CHX"),
  ("0790","WAT"),
  ("0790","FST"),
  ("0790","MYB"),
  ("0790","VXH"),
  ("0790","EUS"),
  ("0790","PAD"),
  ("0790","CST"),
  ("0790","VIC"),
  ("0790","MOG"),
  ("0791","EUS"),
  ("0791","PAD"),
  ("0791","CST"),
  ("0791","VIC"),
  ("0791","MOG"),
  ("0791","STP"),
  ("0791","BFR"),
  ("0791","CTK"),
  ("0791","WAE"),
  ("0791","EAL"),
  ("0791","LBG"),
  ("0791","LST"),
  ("0791","KGX"),
  ("0791","CHX"),
  ("0791","WAT"),
  ("0791","FST"),
  ("0791","MYB"),
  ("0791","VXH"),
  ("0792","VXH"),
  ("0792","EUS"),
  ("0792","PAD"),
  ("0792","CST"),
  ("0792","VIC"),
  ("0792","MOG"),
  ("0792","STP"),
  ("0792","BFR"),
  ("0792","CTK"),
  ("0792","WAE"),
  ("0792","EAL"),
  ("0792","LBG"),
  ("0792","LST"),
  ("0792","KGX"),
  ("0792","CHX"),
  ("0792","WAT"),
  ("0792","FST"),
  ("0792","MYB"),
  ("0793","NXG"),
  ("0793","FPK"),
  ("0793","WHD"),
  ("0793","VXH"),
  ("0793","HHY"),
  ("0793","QPW"),
  ("0793","NWX"),
  ("0793","KTN"),
  ("0793","KPA"),
  ("0793","BRX"),
  ("0793","EPH"),
  ("0797","EPH"),
  ("0797","BAL"),
  ("0797","WIM"),
  ("0797","NXG"),
  ("0797","WHD"),
  ("0797","NWX"),
  ("0797","TOM"),
  ("0797","SRA"),
  ("0797","KTN"),
  ("0797","EAL"),
  ("0797","BRX"),
  ("0825","BKG"),
  ("0825","EPH"),
  ("0825","RMD"),
  ("0825","WIM"),
  ("0825","NXG"),
  ("0825","WHD"),
  ("0825","NWX"),
  ("0825","TOM"),
  ("0825","SRA"),
  ("0825","KTN"),
  ("0825","BRX"),
  ("0829","BKG"),
  ("0829","WIM"),
  ("0829","NXG"),
  ("0829","WHD"),
  ("0829","KPA"),
  ("0829","NWX"),
  ("0829","SRA"),
  ("0830","SVS"),
  ("0830","BAL"),
  ("0830","WIM"),
  ("0830","EAL"),
  ("0830","TOM"),
  ("0830","SRA"),
  ("0835","SRA"),
  ("0835","BAL"),
  ("0835","RMD"),
  ("0835","BKG"),
  ("0835","EAL"),
  ("0839","EAL"),
  ("0839","SRA"),
  ("0839","RMD"),
  ("0841","GFD"),
  ("0841","BKG"),
  ("0844","UPM"),
  ("0844","GFD"),
  ("0844","BKG"),
  ("0844","HOH"),
  ("0847","UPM"),
  ("0847","HOH"),
  ("1072","MYB"),
  ("1072","EUS"),
  ("1072","PAD"),
  ("1072","VIC"),
  ("1072","STP"),
  ("1072","BFR"),
  ("1072","LBG"),
  ("1072","LST"),
  ("1072","KGX"),
  ("1072","CHX"),
  ("1072","WAT"),
  ("1072","FST"),
  ("1780","BOT"),
  ("1780","BNW"),
  ("1998","SOA"),
  ("4452","ZFD"),
  ("4452","EPH"),
  ("4452","CTK"),
  ("4452","STP"),
  ("4452","BFR"),
  ("4452","LBG"),
  ("5564","HWE"),
  ("5564","HWO"),
  ("5564","HWX"),
  ("5564","HWF"),
  ("5564","HTR"),
  ("5564","HWA"),
  ("7468","TBR"),
  ("7468","TIL"),
  ("7934","BCS"),
  ("7934","BIT");