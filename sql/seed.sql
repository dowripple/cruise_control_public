--
-- Sample / reference seed for cruise_control.
--
-- Contents:
--   * Public reference data (cruise line, ports, ships, airline, staff
--     positions, reward-program tiers) so the app has something to render
--     out of the box.
--   * Two demo passengers ("Traveller 1", "Traveller 2") with randomized
--     known-traveler / passport / reward member numbers. login_password is
--     left NULL — use scripts/set_password.py to set one before logging in.
--   * A small handful of sample trips, ports-of-call, events and staff
--     entries. All notes, agent names, sitter names, music playlists and
--     event performer names have been removed or genericized.
--
-- Apply against an empty database AFTER running sql/schema.sql.
--

SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', 'public', false);

--
-- company
--
COPY public.company (company_id, company_name, company_abbr, company_url) FROM stdin;
1	Royal Caribbean Cruises	RCL	www.royalcaribbean.com/
\.

--
-- airline
--
COPY public.airline (airline_id, airline_name, airline_abbr, airline_url, airline_reward_program) FROM stdin;
1	United Airlines	UA	https://www.united.com/en/us	MileagePlus
\.

--
-- cruise_line
--
COPY public.cruise_line (cruise_line_id, company_id, cruise_line, cruise_line_abbr, cruise_line_url, cruise_line_reward_program) FROM stdin;
1	1	Celebrity Cruises	Celeb	https://www.celebritycruises.com/	Captain's Club
\.

--
-- cruise_line_reward_program_level (Celebrity Captain's Club tiers, public)
--
COPY public.cruise_line_reward_program_level (cruise_line_id, program_level, program_level_name, min_points, max_points) FROM stdin;
1	1	Preview	0	1
1	2	Classic	2	149
1	3	Select	150	299
1	4	Elite	300	749
1	5	Elite Plus	750	2999
1	6	Zenith	3000	\N
\.

--
-- staff_position
--
COPY public.staff_position (staff_position_id, staff_position) FROM stdin;
1	Butler
2	Dining
3	Concierge
4	Bartender
5	Room Attendant
6	Casino
\.

--
-- cruise_ship (public reference data)
--
COPY public.cruise_ship (cruise_ship_id, cruise_line_id, ship_name, year_built, occupancy, casino_deck_number, lounge_deck_number, restaurant_deck_number, retreat_deck_number, ship_class) FROM stdin;
1	1	Ascent	2023	3260	4	15	12	16	Edge
2	1	Reflection	2012	3046	4	5	3	\N	Solstice
3	1	Summit	2001	2218	4	4	4	12	Millennium
4	1	Edge	2018	2918	4	15	12	16	Edge
5	1	Constellation	2002	2184	4	4	4	\N	Millennium
6	1	Beyond	2022	3250	4	15	12	15	Edge
\.

--
-- cruise_port (public reference data — ~320 cruise ports worldwide)
--
COPY public.cruise_port (cruise_port_id, cruise_port, city, state, latitude, longitude, nearest_airport, port_notes) FROM stdin;
277	Astoria	Astoria	Oregon	46.188576	-123.858564	\N	\N
4	Port of San Juan	San Juan	Puerto Rico	18.461579	-66.110417	SJU	\N
8	Grand Cayman Cruise Port	Georgetown	Grand Cayman	19.295649	-81.384758	GCM	\N
9	Port of Oranjestad	Oranjestad	Aruba	12.469422	-69.977772	AUA	\N
10	Curacao Cruise Port	Willemstad	Curacao	12.104112	-68.942112	CUR	\N
11	Bonaire Cruise Port	Kralendijk	Bonaire	12.147276	-68.277839	BON	\N
12	Key West Port	Key West	Florida	24.551345	-81.809309	EYW	\N
13	Ocean Cay Port	Bimini	Bahamas	25.417015	-79.205534	MIA	\N
14	Coco Cay	Coco Cay	Bahamas	25.820961	-77.937286	NAS	\N
15	Nassau Marine Port	Nassau	Bahamas	25.081392	-77.340749	NAS	\N
16	Hilo Cruise Port	Hilo	Hawaii	19.730592	-155.055275	ITO	\N
17	Kailua Kona	Kailua Kona	Hawaii	19.637728	-155.99709	KOA	\N
18	Ketchikan	Ketchikan	Alaska	55.349276	-131.683223	KTN	\N
19	Juneau	Juneau	Alaska	58.297381	-134.416926	JNU	\N
20	Skagway	Skagway	Alaska	59.449808	-135.327936	JNU	\N
21	Victoria	Victoria	British Columbia	48.415773	-123.390176	YYJ	\N
22	Tortola	Road Town	British Virgin Islands	18.422221	-64.612748	EIS	\N
23	Majors Bay	Basseterre	St Kitts & Nevis	17.224149	-62.648838	NEV	\N
1	Port Everglades	Fort Lauderdale	Florida	26.086765	-80.119279	FLL	\N
24	Roseau	Roseau	Dominica	15.296358	-61.388257	FDF	\N
25	Castries Marine Port	Castries	St Lucia	14.013788	-60.996057	UVF	\N
26	Bridgetown Port	Bridgetown	Barbados	13.104123	-59.629972	BGI	\N
27	Taino Bay Cruise Port	Puerto Plata	Dominican Republic	19.801409	-70.697598	POP	\N
28	Grand Turk Cruise Center	Grand Turk	Turks & Caicos	21.427842	-71.146496	GDT	\N
6	Port Tampa Bay	Tampa Bay	Florida	27.945759	-82.429603	TPA	\N
7	Port of Miami	Miami	Florida	25.775969	-80.166906	MIA	\N
2	Port of Honolulu	Honolulu	Hawaii	21.315585	-157.8777	HNL	\N
3	Port of Seattle	Seattle	Washington	47.628122	-122.380119	SEA	\N
5	Port of Vancouver	Vancouver	British Columbia	49.288245	-123.109525	YVR	\N
29	Port NOLA	New Orleans	Louisiana	29.940054	-90.060941	MSY	\N
30	Progreso	Progreso	Mexico	21.346412	-89.668951	CZA	\N
31	Charlotte Amalie	Charlotte Amalie	St Thomas	18.339848	-64.931074	EIS	\N
32	Freeport Cruise Port	Freeport	Bahamas	26.520675	-78.76884	FPO	\N
33	A.C. Wathey Pier	Philipsburg	St Maartin	18.011814	-63.047503	SXM	\N
34	Ocho Rios Cruise port	Ocho Rios	Jamaica	18.410444	-77.109756	KIN	\N
35	Pointe-à-Pitre	Pointe-à-Pitre	Guadeloupe	16.238369	-61.539379	ANU	\N
36	St. John's port	St. John's	Antigua	17.120977	-61.84776	ANU	\N
37	St. George	St. George's	Grenada	12.051686	-61.75664	GND	\N
38	Kingstown	Kingstown	Saint Vincent and the Grenadines	13.147595	-61.225574	UNI	\N
39	Singapore	Singapore	\N	1.351616	103.808053	SIN	\N
40	Antigua	Antigua	\N	17.117934	-61.843877	ANU	\N
42	Belize	Belize	\N	17.216854	-88.686007	BZE	\N
45	St. Maarten	St. Maarten	\N	51.54861	4.078502	ANR	\N
46	Kotor	Kotor	Montenegro	42.424921	18.771333	OMO	\N
47	Montevideo	Montevideo	Uruguay	-34.906334	-56.20423	MVD	\N
48	Alexandria	Alexandria	Egypt	31.198877	29.89866	HBE	\N
49	Tangier	Tangier	Morocco	35.76956	-5.803091	TNG	\N
50	Casablanca	Casablanca	Morocco	33.594074	-7.621656	CMN	\N
51	Seward	Seward	Alaska	60.102839	-149.442073	ANC	\N
52	Sitka	Sitka	Alaska	57.050146	-135.33502	SIT	\N
53	Alyeska (Girdwood)	Alyeska (Girdwood)	Alaska	60.959778	-149.11206	ANC	\N
54	Anchorage	Anchorage	Alaska	61.216563	-149.893442	ANC	\N
55	Denali	Denali	Alaska	63.869396	-149.01807	FAI	\N
56	Fairbanks	Fairbanks	Alaska	64.836325	-147.718082	FAI	\N
57	Homer	Homer	Alaska	59.644527	-151.546981	HOM	\N
58	Talkeetna	Talkeetna	Alaska	62.323167	-150.113077	ANC	\N
59	Hong Kong	Hong Kong	China	36.250507	111.66723	CIH	\N
60	Shanghai (Baoshan)	Shanghai (Baoshan)	China	31.232344	121.469102	SHA	\N
61	Tokyo (Yokohama)	Tokyo (Yokohama)	Japan	35.68882	139.692526	HND	\N
62	Tokyo	Tokyo	Japan	35.68882	139.692526	HND	\N
63	Aomori	Aomori	Japan	40.60427	140.827344	AOJ	\N
64	Aqaba	Aqaba	Jordan	29.530264	35.004093	AQJ	\N
65	Bangkok/Laemchabang	Bangkok/Laemchabang	Thailand	13.752494	100.493509	DMK	\N
66	Beijing (Tianjin)	Beijing (Tianjin)	China	39.905714	116.391297	PEK	\N
67	Benoa	Benoa	Bali, Indonesia	-8.652497	115.219118	DPS	\N
68	Beppu	Beppu	Japan	33.2787	131.50453	OIT	\N
69	Boracay	Boracay	Philippines	14.586788	120.981779	MNL	\N
70	Busan	Busan	South Korea	35.179953	129.075236	PUS	\N
71	Colombo	Colombo	Sri Lanka	6.938861	79.854201	CMB	\N
72	Fukuoka	Fukuoka	Japan	33.589733	130.40514	FUK	\N
73	Hakodate	Hakodate	Japan	41.76907	140.72815	HKD	\N
74	Hanoi (Halong Bay)	Hanoi (Halong Bay)	Vietnam	21.028333	105.854041	HAN	\N
75	Hiroshima	Hiroshima	Japan	34.39292	132.46326	HIW	\N
76	Ho Chi Minh(Phu My)	Ho Chi Minh(Phu My)	Vietnam	10.775525	106.702105	SGN	\N
77	Hualien	Hualien	Taiwan	23.982074	121.60681	TPE	\N
78	Hue/Danang (Chan May)	Hue/Danang (Chan May)	Vietnam	16.463932	107.586339	DAD	\N
79	Ishigaki	Ishigaki	Japan	24.3464	124.18535	ISG	\N
80	Jeju Island	Jeju Island	South Korea	33.50286	126.52755	CJU	\N
81	Kagoshima	Kagoshima	Japan	31.596793	130.557195	KOJ	\N
82	Kaohsiung	Kaohsiung	Taiwan	22.6242	120.30182	KHH	\N
83	Khasab	Khasab	Oman	26.179089	56.24933	RKT	\N
84	Ko Samui	Ko Samui	Thailand	9.510544	99.99782	USM	\N
85	Kobe	Kobe	Japan	34.69196	135.19176	ITM	\N
86	Kochi	Kochi	Japan	33.738568	133.819325	KCZ	\N
87	Komodo	Komodo	Indonesia	-8.537565	119.572105	LBJ	\N
88	Kota Kinabalu	Kota Kinabalu	Malaysia	5.978924	116.07284	BKI	\N
89	Kuala Lumpur	Kuala Lumpur	Malaysia	3.151696	101.694237	SZB	\N
90	Kyoto (Osaka)	Kyoto (Osaka)	Japan	35.006172	135.76918	ITM	\N
91	Langkawi	Langkawi	Malaysia	6.320134	99.84938	LGK	\N
92	Manila	Manila	Philippines	14.590449	120.980362	MNL	\N
93	Mt Fuji (Shimizu)	Mt Fuji (Shimizu)	Japan	35.162376	138.68773	HND	\N
94	Muscat	Muscat	Oman	23.587278	58.38213	MCT	\N
95	Nagasaki	Nagasaki	Japan	32.744102	129.87819	NGS	\N
96	Nha Trang	Nha Trang	Vietnam	12.241498	109.18859	NHA	\N
97	Niigata	Niigata	Japan	37.777418	139.50878	KIJ	\N
98	Osaka	Osaka	Japan	34.683594	135.50078	ITM	\N
99	Okinawa	Okinawa	Japan	27.941786	128.200727	TKN	\N
100	Penang	Penang	Malaysia	5.41558	100.3314	PEN	\N
101	Phuket	Phuket	Thailand	7.88346	98.38732	HKT	\N
102	Puerto Princesa	Puerto Princesa	Philippines	9.739856	118.743819	PPS	\N
103	Sendai	Sendai	Japan	38.26358	140.87103	SDJ	\N
104	Seoul (Incheon)	Seoul (Incheon)	South Korea	37.566679	126.978291	GMP	\N
105	Subic Bay	Subic Bay	Philippines	14.878201	120.23421	SFS	\N
106	Taipei (Keelung)	Taipei (Keelung)	Taiwan	25.044743	121.53953	TPE	\N
107	Ilocos (Salomague)	Ilocos (Salomague)	Philippines	14.586788	120.981779	MNL	\N
108	Auckland	Auckland	New Zealand	-36.846996	174.76591	AKL	\N
109	Sydney	Sydney	Australia	-33.86873	151.20695	SYD	\N
110	Airlie Beach	Airlie Beach	Qld, Australia	-20.269331	148.71996	JHQ	\N
111	Apia	Apia	Samoa	-13.836945	-171.802879	APW	\N
112	Bay Of Islands	Bay Of Islands	New Zealand	-41.838875	171.7799	WSZ	\N
113	Bora Bora	Bora Bora	French Polynesia	-16.494444	-151.736389	BOB	\N
114	Brisbane	Brisbane	Australia	-27.469099	153.0277	BNE	\N
115	Cairns(Yorkey's Knob)	Cairns(Yorkey's Knob)	Australia	-16.92133	145.77678	CNS	\N
116	Christchurch	Christchurch	New Zealand	-43.533516	172.63503	CHC	\N
117	Dunedin	Dunedin	New Zealand	-45.87451	170.50339	DUD	\N
118	Eden	Eden	Australia	-37.066517	149.90715	MIM	\N
119	Hobart	Hobart	Tasmania	-42.882603	147.32573	HBA	\N
121	Lautoka	Lautoka	Fiji	-17.598539	177.465672	NAN	\N
120	Isle Of Pines	Isle Of Pines	New Caledonia	-22.661132	167.437467	\N	\N
122	Lifou	Lifou	Loyalty Island	-20.916274	167.264335	LIF	\N
123	Mare	Mare	New Caledonia	-21.316338	165.715489	NOU	\N
124	Mystery Island	Mystery Island	Vanuatu	54.60346	-5.887237	BFS	\N
125	Napier	Napier	New Zealand	-39.489494	176.91814	NPE	\N
126	Newcastle	Newcastle	Australia	-32.926773	151.77478	SYD	\N
127	Noumea	Noumea	New Caledonia	-22.275595	166.439931	NOU	\N
128	Nuku 'Alofa	Nuku 'Alofa	Tonga	-29.579444	31.100833	DUR	\N
129	Pago Pago	Pago Pago	American Samoa	-14.27377	-170.7024	PPG	\N
130	Papeete	Papeete	Tahiti, Fr.polynesia	-17.6368	-149.4556	PPT	\N
131	Picton	Picton	New Zealand	-41.288536	174.00786	WLG	\N
132	Port Arthur	Port Arthur	Tasmania	-43.14596	147.84769	HBA	\N
133	Port Douglas	Port Douglas	Australia	-16.48268	145.46411	CNS	\N
135	Suva	Suva	Fiji	-18.135982	178.442814	SUV	\N
136	Tauranga	Tauranga	New Zealand	-37.684353	176.16905	HLZ	\N
137	Vavau (Neiafu)	Vavau (Neiafu)	Tonga	-18.651554	-173.983312	VAV	\N
138	Port Vila	Port Vila	Vanuatu	-17.731392	168.306222	VLI	\N
139	Wellington	Wellington	New Zealand	-41.28559	174.77672	WLG	\N
140	Port Canaveral	Port Canaveral	Orlando (Port Canaveral)	38.688194	0.133074	ALC	\N
142	Charleston	Charleston	South Carolina	32.789284	-79.938628	CHS	\N
143	Newport	Newport	Rhode Island	41.489629	-71.312658	BOS	\N
145	Martha's Vineyard	Martha's Vineyard	Bermuda	41.4	-70.616667	BOS	\N
146	Boston	Boston	Massachusetts	42.35888	-71.056804	BOS	\N
147	Southampton	Southampton	England	50.902535	-1.404189	BRS	\N
148	Akureyri	Akureyri	Iceland	65.682636	-18.091299	AEY	\N
149	Bar Harbor	Bar Harbor	Maine	44.389779	-68.204744	BGR	\N
150	Charlottetown	Charlottetown	P.E.I.	34.72865	116.93511	JNG	\N
151	Halifax	Halifax	Nova Scotia	44.648618	-63.585949	YHZ	\N
152	Portland	Portland	Maine	43.655927	-70.2525	PWM	\N
153	Kirkwall	Kirkwall	Scotland	58.98479	-2.958671	KOI	\N
154	Rockland	Rockland	Maine	44.102138	-69.109051	BGR	\N
155	Qaqortoq	Qaqortoq	Greenland	60.718202	-46.038521	UAK	\N
156	Quebec City	Quebec City	Quebec	46.812187	-71.20278	YQB	\N
157	Reykjavik	Reykjavik	Iceland	64.145847	-21.9436	KEF	\N
158	Saint John	Saint John	New Brunswick (Bay Of Fundy)	45.272835	-66.06237	YQM	\N
160	Colon	Colon	Panama	9.356469	-79.90248	PAC	\N
163	Falmouth	Falmouth	Jamaica	18.49475	-77.666274	MBJ	\N
164	Fort De France	Fort De France	Martinique	14.603556	-61.071274	FDF	\N
165	Grand Bahama	Grand Bahama	Grand Bahama Island	64.997588	-18.605467	AEY	\N
166	Ponce	Ponce	Puerto Rico	18.011564	-66.613958	SJU	\N
167	Puerto Limon	Puerto Limon	Costa Rica	9.993571	-83.03043	LIO	\N
168	Punta Cana	Punta Cana	Dominican Republic	18.55827	-68.36815	PUJ	\N
169	Roatan	Roatan	Honduras	16.383417	-86.417833	RTB	\N
170	Samana	Samana	Dominican Republic	19.203512	-69.33499	AZS	\N
171	St. Croix	St. Croix	U.S.V.I.	17.743948	-64.707982	EIS	\N
172	Amsterdam	Amsterdam	Netherlands	52.378	4.9	ANR	\N
173	Athens (Piraeus)	Athens (Piraeus)	Greece	37.97757	23.729275	ATH	\N
174	Barcelona	Barcelona	Spain	41.38723	2.16538	BCN	\N
175	Lisbon	Lisbon	Portugal	38.7173	-9.14305	BYJ	\N
176	Rome (Civitavecchia)	Rome (Civitavecchia)	Italy	41.899986	12.476713	FCO	\N
177	Rotterdam	Rotterdam	Netherlands	51.92079	4.487597	ANR	\N
178	Ravenna (Venice)	Ravenna (Venice)	Italy	44.417713	12.198749	RMI	\N
179	Aarhus	Aarhus	Denmark	56.15581	10.206425	AAR	\N
180	Ajaccio	Ajaccio	Corsica	41.91863	8.736935	AJA	\N
181	Amalfi Coast (Salerno)	Amalfi Coast (Salerno)	Italy	40.633877	14.602578	NAP	\N
182	Kefalonia (Argostoli)	Kefalonia (Argostoli)	Greece	38.265	20.5525	EFL	\N
183	Alesund	Alesund	Norway	62.47293	6.156597	AES	\N
184	Alicante	Alicante	Spain	38.34558	-0.4855	ALC	\N
185	Belfast	Belfast	Northern Ireland	54.596441	-5.930276	BFS	\N
186	Bergen	Bergen	Norway	60.39555	5.325952	BGO	\N
187	Berlin (Rostock)	Berlin (Rostock)	Germany	52.517389	13.395131	TXL	\N
188	Berlin (Warnemunde)	Berlin (Warnemunde)	Germany	52.517389	13.395131	TXL	\N
189	Bilbao	Bilbao	Spain	43.260117	-2.931466	BIO	\N
190	Bruges	Bruges	(Zeebrugge), Belgium	51.208553	3.226772	OST	\N
191	Cagliari	Cagliari	Sardinia, Italy	39.217199	9.113311	CAG	\N
192	Cannes	Cannes	France	43.55161	7.016611	ALL	\N
193	Cartagena	Cartagena	Spain	37.601097	-0.984953	RMU	\N
194	Catania	Catania	Sicily, Italy	38.111227	13.352443	PMO	\N
195	Chania (Souda)	Chania (Souda)	Crete, Greece	35.5149	24.01925	CHQ	\N
197	Copenhagen	Copenhagen	Denmark	55.675313	12.569734	CPH	\N
198	Corfu	Corfu	Greece	39.623889	19.82	CFU	\N
199	Cork (Cobh)	Cork (Cobh)	Ireland	51.898514	-8.472642	ORK	\N
200	Djupivogur	Djupivogur	Iceland	64.65656	-14.283459	DJU	\N
201	Dover	Dover	England	51.126404	1.309957	MSE	\N
202	Dublin	Dublin	Ireland	53.34938	-6.260559	BFS	\N
203	Dubrovnik	Dubrovnik	Croatia	42.648808	18.093882	OMO	\N
205	Flam	Flam	Norway	60.86355	7.116472	SOG	\N
206	Florence/Pisa (La Spezia)	Florence/Pisa (La Spezia)	Italy	43.771484	11.256129	PSA	\N
207	Florence/Pisa (Livorno)	Florence/Pisa (Livorno)	Italy	43.771484	11.256129	PSA	\N
208	Geiranger	Geiranger	Norway	62.101803	7.207343	HOV	\N
210	Glasgow (Greenock)	Glasgow (Greenock)	Scotland	55.860982	-4.248879	GLA	\N
161	Costa Maya	Costa Maya	Mexico	18.730437	-87.68988	\N	\N
162	Cozumel	Cozumel	Mexico	20.510435	-86.956419	\N	\N
144	Royal Naval Dockyard	Royal Naval Dockyard	Bermuda	32.325174	-64.831349	\N	\N
204	Ephesus (Kusadasi)	Ephesus (Kusadasi)	Turkey	37.868859	27.259289	\N	\N
141	Cape Liberty	Cape Liberty	New Jersey (NY Metro)	40.664986	-74.070151	\N	\N
134	Lelepa	Lelepa	Vanuatu	-17.748828	168.313335	\N	\N
196	Cherbourg	Cherbourg	France	49.647431	-1.616049	\N	\N
209	Gibraltar	Gibraltar	Gibraltar	42.098404	-83.187823	\N	\N
211	Gran Canaria	Gran Canaria	Canary Islands	28.469648	-16.254088	TFN	\N
212	Haifa	Haifa	Israel	32.81865	34.999767	HFA	\N
213	Haugesund	Haugesund	Norway	59.4135	5.267252	HAU	\N
214	Helsinki	Helsinki	Finland	60.167507	24.941822	HEM	\N
215	Honningsvag	Honningsvag	Norway	70.98037	25.97746	HVG	\N
216	Hydra	Hydra	Greece	37.34977	23.466337	ATH	\N
217	Ibiza	Ibiza	Spain	38.90902	1.433561	IBZ	\N
218	Inverness Loch Ness	Inverness Loch Ness	Inverness/Loch Ness Scotland	57.479012	-4.225739	INV	\N
219	Isafjordur	Isafjordur	Iceland	66.07282	-23.119629	IFJ	\N
220	Istanbul	Istanbul	Turkey	41.009043	28.9661	ISL	\N
221	Jerusalem (Ashdod)	Jerusalem (Ashdod)	Israel	31.773315	35.18679	TLV	\N
222	Olympia (Katakolon)	Olympia (Katakolon)	Greece	38.24721	25.942976	ADB	\N
223	Koper	Koper	Slovenia	45.547986	13.730478	POW	\N
224	Kristiansand	Kristiansand	Norway	58.145233	7.993821	KRS	\N
225	Porto (Leixoes)	Porto (Leixoes)	Portugal	41.14789	-8.611286	OPO	\N
226	Bar	Bar	Montenegro	42.097975	19.095453	TIA	\N
227	La Coruna	La Coruna	Spain	43.369846	-8.401512	LCG	\N
228	Lanzarote	Lanzarote	Canary Islands	28.469648	-16.254088	TFN	\N
229	Lerwick	Lerwick	Scotland	60.15313	-1.142721	LWK	\N
230	Limassol	Limassol	Cyprus	34.68534	33.032833	PFO	\N
231	Liverpool	Liverpool	England	53.407154	-2.991665	BLK	\N
232	Madeira (Funchal)	Madeira (Funchal)	Portugal	32.64965	-16.908678	FNC	\N
233	Malaga	Malaga	Spain	36.720476	-4.412525	AGP	\N
234	Molde	Molde	Norway	62.73768	7.16054	MOL	\N
235	Monte Carlo	Monte Carlo	Monaco	43.740444	7.4256	ALL	\N
236	Mykonos	Mykonos	Greece	37.446503	25.326384	ATH	\N
237	Naples	Naples	Italy	40.84603	14.253269	NAP	\N
238	Nafplio	Nafplio	Greece	37.567783	22.806903	ATH	\N
239	Nice (Villefranche)	Nice (Villefranche)	France	43.710082	7.261844	ALL	\N
240	Nynashamn	Nynashamn	Sweden	58.902786	17.949139	BMA	\N
241	Olden	Olden	Norway	61.83456	6.807039	SDN	\N
242	Oslo	Oslo	Norway	59.91333	10.73897	OSL	\N
243	Palma De Mallorca	Palma De Mallorca	Spain	39.570812	2.647822	PMI	\N
244	Paris (Le Havre)	Paris (Le Havre)	France	48.853495	2.348392	CDG	\N
245	Ponta Delgada	Ponta Delgada	Azores	37.74021	-25.668623	PDL	\N
246	Portofino	Portofino	Italy	44.30291	9.20979	ALL	\N
249	Rijeka	Rijeka	Croatia	45.326084	14.442651	RJK	\N
250	Rhodes	Rhodes	Greece	36.44352	28.227915	DLM	\N
252	Santorini	Santorini	Greece	36.415	25.4325	HER	\N
253	Sete	Sete	France	43.401695	3.696654	MPL	\N
254	Seville (Cadiz)	Seville (Cadiz)	Spain	37.389416	-5.992558	SVQ	\N
255	Seydisfjordur	Seydisfjordur	Iceland	64.997588	-18.605467	AEY	\N
256	Sicily (Messina)	Sicily (Messina)	Italy	38.111227	13.352443	PMO	\N
257	Sicily (Palermo)	Sicily (Palermo)	Italy	38.111227	13.352443	PMO	\N
258	Skagen	Skagen	Denmark	57.722153	10.588804	CNL	\N
259	Split	Split	Croatia	43.508186	16.438787	OMO	\N
260	St. Peter Port	St. Peter Port	Channel Isl	46.414997	-62.58081	YYG	\N
261	Stavanger	Stavanger	Norway	58.970963	5.733589	SVG	\N
262	Stockholm	Stockholm	Sweden	59.324337	18.06902	BMA	\N
263	Tallinn	Tallinn	Estonia	59.436745	24.746462	TLL	\N
264	Taranto	Taranto	Italy	40.471813	17.239958	BRI	\N
265	Tenerife	Tenerife	Canary Islands	28.469648	-16.254088	TFN	\N
266	Thessaloniki	Thessaloniki	Greece	40.633987	22.944689	SKG	\N
267	Trieste	Trieste	Italy	45.650043	13.772238	POW	\N
268	Trondheim	Trondheim	Norway	63.432697	10.397414	TRD	\N
269	Valencia	Valencia	Spain	39.47132	-0.375984	ALC	\N
270	Valletta	Valletta	Malta	35.898998	14.513661	MLA	\N
271	Vigo	Vigo	Spain	42.237534	-8.723104	VGO	\N
272	Visby	Visby	Sweden	57.63947	18.294163	VBY	\N
273	Waterford (Dunmore E.)	Waterford (Dunmore E.)	Ireland	52.261	-7.111908	WAT	\N
274	Zadar	Zadar	Croatia	44.121859	15.234303	ZAD	\N
275	Zakynthos	Zakynthos	Greece	37.8	20.75	ZTH	\N
276	Los Angeles	Los Angeles	California	34.048051	-118.254187	LAX	\N
278	Ensenada	Ensenada	Mexico	31.866417	-116.60352	TIJ	\N
279	Lahaina	Lahaina	Maui, Hawaii	20.875253	-156.679805	HNL	\N
280	Cabo San Lucas	Cabo San Lucas	Mexico	22.886593	-109.911705	SJD	\N
281	La Paz	La Paz	Mexico	24.161955	-110.315605	LAP	\N
282	Mazatlan	Mazatlan	Mexico	23.198515	-106.42282	MZT	\N
283	Puerto Vallarta	Puerto Vallarta	Mexico	20.640686	-105.22131	PVR	\N
284	San Diego	San Diego	California	32.713623	-117.16016	SAN	\N
285	Catalina Island	Catalina Island	California	33.383333	-118.416667	LAX	\N
286	San Francisco	San Francisco	California	37.779238	-122.419359	SFO	\N
287	Monterey	Monterey	California	36.600213	-121.895799	SJC	\N
288	Santa Barbara	Santa Barbara	California	34.423349	-119.70343	LAX	\N
289	Puerto Quetzal	Puerto Quetzal	Guatemala	15.605589	-90.390002	CBV	\N
290	Puntarenas	Puntarenas	Costa Rica	9.977295	-84.83366	SJO	\N
291	Buenos Aires	Buenos Aires	Argentina	-34.609558	-58.38879	EZE	\N
292	Valparaiso	Valparaiso	Chile	-33.041965	-71.624306	SCL	\N
293	Rio De Janeiro	Rio De Janeiro	Brazil	-22.909534	-43.209934	GIG	\N
294	Arica	Arica	Chile	-18.476973	-70.318924	TCQ	\N
295	Buzios	Buzios	Brazil	-22.755255	-41.8872	GIG	\N
296	Caldera	Caldera	Costa Rica	9.924575	-84.70942	SJO	\N
298	Elephant Island	Elephant Island	Antarctica	-61.133333	-55.116667	TNM	\N
299	Huatulco	Huatulco	Mexico	15.832771	-96.32076	HUX	\N
300	Ilhabela	Ilhabela	Brazil	-23.815762	-45.36982	GRU	\N
301	La Serena (Coquimbo)	La Serena (Coquimbo)	Chile	-29.90444	-71.2501	LSC	\N
248	Provence (Marseille)	Marseille	France	43.351824	5.319133	\N	\N
247	Provence (Toulon)	Toulon	France	43.116708	5.921836	\N	\N
251	Santa Margherita	Santa Margherita	Italy	37.909109	15.343206	\N	\N
297	Cape Horn (Isla Hornos)	Cape Horn	Chile	-55.97837	-67.264047	\N	\N
302	Lima	Lima	(Callao) Peru	-12.06973	-77.03542	LIM	\N
303	Manta	Manta	Ecuador	-0.948078	-80.721146	MEC	\N
304	Salvador de Bahia	Salvador de Bahia	Brazil	-12.982129	-38.482414	SSA	\N
306	Pisco (San Martin)	Pisco (San Martin)	Peru	-13.710463	-76.20357	PIO	\N
307	Port Stanley	Port Stanley	Falkland Island	-51.674275	-57.804029	PSY	\N
308	Puerto Madryn	Puerto Madryn	Argentina	-42.7676	-65.03564	PMY	\N
309	Puerto Montt	Puerto Montt	Chile	-41.47261	-72.9398	PMC	\N
310	Punta Arenas	Punta Arenas	Chile	-53.163063	-70.90529	PUQ	\N
311	Punta Del Este	Punta Del Este	Uruguay	-34.961597	-54.942978	PDP	\N
312	San Antonio	San Antonio	Chile	-33.580566	-71.61448	SCL	\N
313	Sao Paulo (Santos)	Sao Paulo (Santos)	Brazil	-23.55214	-46.647198	GRU	\N
315	Ushuaia	Ushuaia	Argentina	-54.806793	-68.3064	RGA	\N
316	Agadir	Agadir	Morocco	30.418049	-9.597018	AGA	\N
317	New York	New York	New York	40.712749	-74.005994	EWR	\N
318	Recife	Recife	Brazil	-8.062725	-34.88047	REC	\N
319	Melbourne	Melbourne	Australia	-37.814198	144.96333	MEL	\N
320	Moorea	Moorea	French Polynesia	-17.538122	-149.564667	PPT	\N
321	Otaru	Otaru	Japan	43.194233	140.99916	OKD	\N
322	Sapporo (Muroran)	Sapporo (Muroran)	Japan	43.055573	141.35326	OKD	\N
305	Paradise Bay	Paradise Bay	Antarctica	-64.860434	-62.883671	\N	\N
314	Schollaert Channel & Dalhan Bay	Schollaert Channel & Dalhan Bay	Antarctica	-64.520533	-62.827334	\N	\N
\.

--
-- passenger (sanitized demo data — randomized KTN / passport / login_password)
--
COPY public.passenger (passenger_id, passenger_name, known_traveler_number, passport_number, passport_expiration_date, passenger_abbr, home_city, home_airport, login_id, login_password) FROM stdin;
1	Traveller 1	TT94K7H2R8	X48201735	2034-08-12	T1	\N	\N	traveller1	\N
2	Traveller 2	TT58F1B9C3	X73649128	2034-11-04	T2	\N	\N	traveller2	\N
\.

--
-- airline_reward_member (randomized member numbers)
--
COPY public.airline_reward_member (airline_id, passenger_id, member_number) FROM stdin;
1	1	MP31827406
1	2	MP59104638
\.

--
-- cruise_line_reward_member (randomized member numbers)
--
COPY public.cruise_line_reward_member (cruise_line_id, passenger_id, member_number, current_program_level, current_points) FROM stdin;
1	1	142907583	2	60
1	2	368241095	2	60
\.

--
-- cruise_trip (sanitized — agent/sitter/notes/music removed)
--
COPY public.cruise_trip (cruise_ship_id, departure_date, arrival_date, book_date, deck_number, room_number, suite_yn, trip_cost, amount_paid, club_points, departure_port_id, arrival_port_id, amount_due_date, need_airfare_yn, airfare_purchased_yn, airfare_cost, need_hotel_yn, hotel_booked_yn, hotel_cost, trip_notes, agent_yn, cruise_name, agent_name, cruise_length_days, cruise_trip_id, cat_sitter, cat_sitter_cost, apple_music_url, trip_haiku) FROM stdin;
1	2026-11-08	2026-11-17	2026-10-22	6	6102	0	$8,400.00	$8,400.00	33	1	1	\N	1	1	\N	1	1	\N	\N	0	9 Night Aruba and Curacao	\N	9	1	\N	\N	\N	\N
2	2027-05-18	2027-05-23	2026-11-23	12	2186	1	$4,500.00	$4,500.00	53	1	1	2027-02-17	1	1	\N	1	1	\N	\N	0	5 Night Bahamas & Perfect Day	\N	5	2	\N	\N	\N	\N
4	2027-05-07	2027-05-15	2026-12-02	7	7204	1	$8,303.00	$8,303.00	72	2	5	2027-02-06	1	1	\N	1	1	\N	\N	0	8 Night Hawaii Cruise	\N	8	3	\N	\N	\N	\N
\.

--
-- cruise_trip_ports
--
COPY public.cruise_trip_ports (cruise_trip_id, cruise_trip_day, cruise_trip_date, cruise_port_id, cruise_trip_comment) FROM stdin;
1	1	2026-11-08	1	\N
1	4	2026-11-11	8	\N
1	5	2026-11-12	9	\N
1	6	2026-11-13	10	\N
1	7	2026-11-14	11	\N
1	9	2026-11-17	1	\N
2	1	2027-05-18	1	\N
2	3	2027-05-20	12	\N
2	4	2027-05-21	13	\N
2	5	2027-05-23	1	\N
3	1	2027-05-07	2	\N
3	2	2027-05-08	16	\N
3	3	2027-05-09	17	\N
3	9	2027-05-15	5	\N
\.

--
-- cruise_trip_event (generic — no performer names)
--
COPY public.cruise_trip_event (cruise_trip_event_id, cruise_trip_id, event_name, event_notes, event_date, event_time, event_location) FROM stdin;
1	3	Headliner Show	\N	2027-05-07	21:00:00	The Theatre
2	3	Production Show	\N	2027-05-08	21:00:00	The Theatre
3	3	Couples massage	\N	2027-05-12	11:00:00	The Spa
4	3	Ship excursion	\N	2027-05-13	11:00:00	Shore Excursions Desk
\.

--
-- cruise_trip_staff (generic placeholders)
--
COPY public.cruise_trip_staff (cruise_trip_staff_id, cruise_trip_id, name, staff_position_id, location, notes) FROM stdin;
1	1	(sample)	1	Suite	\N
\.

--
-- Reset sequences past the inserted rows
--
SELECT pg_catalog.setval('public.company_CompanyID_seq', 1, true);
SELECT pg_catalog.setval('public.airline_airline_id_seq', 1, true);
SELECT pg_catalog.setval('public.cruise_line_cruise_line_id_seq', 1, true);
SELECT pg_catalog.setval('public.cruise_port_cruise_port_id_seq', 322, true);
SELECT pg_catalog.setval('public.cruise_ship_cruise_ship_id_seq', 6, true);
SELECT pg_catalog.setval('public.cruise_trip_cruise_trip_id_seq', 3, true);
SELECT pg_catalog.setval('public.cruise_trip_event_cruise_trip_event_id_seq', 4, true);
SELECT pg_catalog.setval('public.cruise_trip_photos_cruise_trip_photo_id_seq', 1, false);
SELECT pg_catalog.setval('public.cruise_trip_staff_cruise_trip_staff_id_seq', 1, true);
SELECT pg_catalog.setval('public.passenger_passenger_id_seq', 2, true);
SELECT pg_catalog.setval('public.staff_position_staff_position_id_seq', 6, true);
