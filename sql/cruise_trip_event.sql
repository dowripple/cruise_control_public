-- Schema: cruise_trip_event
-- Stores per-trip events (shows, comedy, dinner reservations, port excursions,
-- meet-ups, etc.) that surface as timed entries on the travelers-tab calendar.

CREATE TABLE public.cruise_trip_event (
    cruise_trip_event_id integer NOT NULL,
    cruise_trip_id integer NOT NULL,
    event_date date,
    event_time time without time zone,
    event_name character varying(200),
    event_location character varying(200),
    event_notes text
);

CREATE SEQUENCE public.cruise_trip_event_cruise_trip_event_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.cruise_trip_event_cruise_trip_event_id_seq
    OWNED BY public.cruise_trip_event.cruise_trip_event_id;

ALTER TABLE ONLY public.cruise_trip_event
    ALTER COLUMN cruise_trip_event_id
    SET DEFAULT nextval('public.cruise_trip_event_cruise_trip_event_id_seq'::regclass);

ALTER TABLE ONLY public.cruise_trip_event
    ADD CONSTRAINT cruise_trip_event_pkey
    PRIMARY KEY (cruise_trip_event_id);
