--
-- PostgreSQL database dump
--

-- Dumped from database version 12.1
-- Dumped by pg_dump version 12.1

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: airline; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.airline (
    airline_id integer NOT NULL,
    airline_name character varying(150),
    airline_abbr character varying(10),
    airline_url character varying(150),
    airline_reward_program character varying(100)
);


--
-- Name: airline_airline_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.airline_airline_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: airline_airline_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.airline_airline_id_seq OWNED BY public.airline.airline_id;


--
-- Name: airline_reward_member; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.airline_reward_member (
    airline_id integer NOT NULL,
    passenger_id integer NOT NULL,
    member_number character varying(150)
);


--
-- Name: company; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.company (
    company_id integer NOT NULL,
    company_name character varying(50),
    company_abbr character varying(10),
    company_url character varying(150)
);


--
-- Name: company_CompanyID_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."company_CompanyID_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: company_CompanyID_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."company_CompanyID_seq" OWNED BY public.company.company_id;


--
-- Name: cruise_line; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cruise_line (
    cruise_line_id integer NOT NULL,
    company_id integer,
    cruise_line character varying(50),
    cruise_line_abbr character varying(10),
    cruise_line_url character varying(150),
    cruise_line_reward_program character varying(50)
);


--
-- Name: cruise_line_cruise_line_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.cruise_line_cruise_line_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: cruise_line_cruise_line_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.cruise_line_cruise_line_id_seq OWNED BY public.cruise_line.cruise_line_id;


--
-- Name: cruise_line_reward_member; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cruise_line_reward_member (
    cruise_line_id integer NOT NULL,
    passenger_id integer NOT NULL,
    member_number character varying(100),
    current_program_level integer,
    current_points double precision
);


--
-- Name: cruise_line_reward_program_level; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cruise_line_reward_program_level (
    cruise_line_id integer NOT NULL,
    program_level integer NOT NULL,
    program_level_name character varying(150),
    min_points integer,
    max_points integer
);


--
-- Name: cruise_port; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cruise_port (
    cruise_port_id integer NOT NULL,
    cruise_port character varying(100),
    city character varying(100),
    state character varying(50),
    latitude double precision,
    longitude double precision,
    nearest_airport character varying(10),
    port_notes text
);


--
-- Name: cruise_port_cruise_port_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.cruise_port_cruise_port_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: cruise_port_cruise_port_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.cruise_port_cruise_port_id_seq OWNED BY public.cruise_port.cruise_port_id;


--
-- Name: cruise_ship; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cruise_ship (
    cruise_ship_id integer NOT NULL,
    cruise_line_id integer,
    ship_name character varying(50),
    year_built integer,
    occupancy integer,
    casino_deck_number integer,
    lounge_deck_number integer,
    restaurant_deck_number integer,
    retreat_deck_number integer,
    ship_class character varying(50)
);


--
-- Name: cruise_ship_cruise_ship_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.cruise_ship_cruise_ship_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: cruise_ship_cruise_ship_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.cruise_ship_cruise_ship_id_seq OWNED BY public.cruise_ship.cruise_ship_id;


--
-- Name: cruise_trip; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cruise_trip (
    cruise_ship_id integer NOT NULL,
    departure_date date NOT NULL,
    arrival_date date,
    book_date date,
    deck_number integer,
    room_number integer,
    suite_yn bit(1),
    trip_cost money,
    amount_paid money,
    club_points integer,
    departure_port_id bigint,
    arrival_port_id bigint,
    amount_due_date date,
    need_airfare_yn bit(1),
    airfare_purchased_yn bit(1),
    airfare_cost money,
    need_hotel_yn bit(1),
    hotel_booked_yn bit(1),
    hotel_cost money,
    trip_notes character varying(800),
    agent_yn bit(1),
    cruise_name character varying(150),
    agent_name character varying(100),
    cruise_length_days integer,
    cruise_trip_id integer NOT NULL,
    cat_sitter character varying(100),
    cat_sitter_cost money,
    apple_music_url character varying(500),
    trip_haiku text
);


--
-- Name: cruise_trip_cruise_trip_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.cruise_trip_cruise_trip_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: cruise_trip_cruise_trip_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.cruise_trip_cruise_trip_id_seq OWNED BY public.cruise_trip.cruise_trip_id;


--
-- Name: cruise_trip_event; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cruise_trip_event (
    cruise_trip_event_id integer NOT NULL,
    cruise_trip_id integer NOT NULL,
    event_name character varying(200),
    event_notes text,
    event_date date,
    event_time time without time zone,
    event_location character varying(200)
);


--
-- Name: cruise_trip_event_cruise_trip_event_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.cruise_trip_event_cruise_trip_event_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: cruise_trip_event_cruise_trip_event_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.cruise_trip_event_cruise_trip_event_id_seq OWNED BY public.cruise_trip_event.cruise_trip_event_id;


--
-- Name: cruise_trip_photos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cruise_trip_photos (
    cruise_trip_photo_id integer NOT NULL,
    cruise_trip_id integer NOT NULL,
    file_path character varying(500),
    original_filename character varying(255),
    caption character varying(500),
    uploaded_at timestamp without time zone DEFAULT now()
);


--
-- Name: cruise_trip_photos_cruise_trip_photo_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.cruise_trip_photos_cruise_trip_photo_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: cruise_trip_photos_cruise_trip_photo_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.cruise_trip_photos_cruise_trip_photo_id_seq OWNED BY public.cruise_trip_photos.cruise_trip_photo_id;


--
-- Name: cruise_trip_ports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cruise_trip_ports (
    cruise_trip_id integer NOT NULL,
    cruise_trip_day integer NOT NULL,
    cruise_trip_date date,
    cruise_port_id integer,
    cruise_trip_comment character varying(500)
);


--
-- Name: cruise_trip_staff; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cruise_trip_staff (
    cruise_trip_staff_id integer NOT NULL,
    cruise_trip_id integer NOT NULL,
    name character varying(100),
    staff_position_id integer,
    location character varying(200),
    notes character varying
);


--
-- Name: cruise_trip_staff_cruise_trip_staff_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.cruise_trip_staff_cruise_trip_staff_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: cruise_trip_staff_cruise_trip_staff_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.cruise_trip_staff_cruise_trip_staff_id_seq OWNED BY public.cruise_trip_staff.cruise_trip_staff_id;


--
-- Name: passenger; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.passenger (
    passenger_id integer NOT NULL,
    passenger_name character varying(50),
    known_traveler_number character varying(100),
    passport_number character varying(100),
    passport_expiration_date date,
    passenger_abbr character varying(10),
    home_city character varying(100),
    home_airport character varying(10),
    login_id character varying(50),
    login_password text
);


--
-- Name: passenger_passenger_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.passenger_passenger_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: passenger_passenger_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.passenger_passenger_id_seq OWNED BY public.passenger.passenger_id;


--
-- Name: staff_position; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.staff_position (
    staff_position_id integer NOT NULL,
    staff_position character varying(50)
);


--
-- Name: staff_position_staff_position_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.staff_position_staff_position_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: staff_position_staff_position_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.staff_position_staff_position_id_seq OWNED BY public.staff_position.staff_position_id;


--
-- Name: airline airline_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.airline ALTER COLUMN airline_id SET DEFAULT nextval('public.airline_airline_id_seq'::regclass);


--
-- Name: company company_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company ALTER COLUMN company_id SET DEFAULT nextval('public."company_CompanyID_seq"'::regclass);


--
-- Name: cruise_line cruise_line_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cruise_line ALTER COLUMN cruise_line_id SET DEFAULT nextval('public.cruise_line_cruise_line_id_seq'::regclass);


--
-- Name: cruise_port cruise_port_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cruise_port ALTER COLUMN cruise_port_id SET DEFAULT nextval('public.cruise_port_cruise_port_id_seq'::regclass);


--
-- Name: cruise_ship cruise_ship_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cruise_ship ALTER COLUMN cruise_ship_id SET DEFAULT nextval('public.cruise_ship_cruise_ship_id_seq'::regclass);


--
-- Name: cruise_trip cruise_trip_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cruise_trip ALTER COLUMN cruise_trip_id SET DEFAULT nextval('public.cruise_trip_cruise_trip_id_seq'::regclass);


--
-- Name: cruise_trip_event cruise_trip_event_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cruise_trip_event ALTER COLUMN cruise_trip_event_id SET DEFAULT nextval('public.cruise_trip_event_cruise_trip_event_id_seq'::regclass);


--
-- Name: cruise_trip_photos cruise_trip_photo_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cruise_trip_photos ALTER COLUMN cruise_trip_photo_id SET DEFAULT nextval('public.cruise_trip_photos_cruise_trip_photo_id_seq'::regclass);


--
-- Name: cruise_trip_staff cruise_trip_staff_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cruise_trip_staff ALTER COLUMN cruise_trip_staff_id SET DEFAULT nextval('public.cruise_trip_staff_cruise_trip_staff_id_seq'::regclass);


--
-- Name: passenger passenger_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.passenger ALTER COLUMN passenger_id SET DEFAULT nextval('public.passenger_passenger_id_seq'::regclass);


--
-- Name: staff_position staff_position_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_position ALTER COLUMN staff_position_id SET DEFAULT nextval('public.staff_position_staff_position_id_seq'::regclass);


--
-- Name: airline airline_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.airline
    ADD CONSTRAINT airline_pkey PRIMARY KEY (airline_id);


--
-- Name: airline_reward_member airline_reward_member_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.airline_reward_member
    ADD CONSTRAINT airline_reward_member_pkey PRIMARY KEY (airline_id, passenger_id);


--
-- Name: company company_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company
    ADD CONSTRAINT company_pkey PRIMARY KEY (company_id);


--
-- Name: cruise_line cruise_line_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cruise_line
    ADD CONSTRAINT cruise_line_pkey PRIMARY KEY (cruise_line_id);


--
-- Name: cruise_line_reward_member cruise_line_reward_member_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cruise_line_reward_member
    ADD CONSTRAINT cruise_line_reward_member_pkey PRIMARY KEY (cruise_line_id, passenger_id);


--
-- Name: cruise_line_reward_program_level cruise_line_reward_program_level_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cruise_line_reward_program_level
    ADD CONSTRAINT cruise_line_reward_program_level_pkey PRIMARY KEY (cruise_line_id, program_level);


--
-- Name: cruise_port cruise_port_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cruise_port
    ADD CONSTRAINT cruise_port_pkey PRIMARY KEY (cruise_port_id);


--
-- Name: cruise_ship cruise_ship_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cruise_ship
    ADD CONSTRAINT cruise_ship_pkey PRIMARY KEY (cruise_ship_id);


--
-- Name: cruise_trip_event cruise_trip_event_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cruise_trip_event
    ADD CONSTRAINT cruise_trip_event_pkey PRIMARY KEY (cruise_trip_event_id);


--
-- Name: cruise_trip_photos cruise_trip_photos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cruise_trip_photos
    ADD CONSTRAINT cruise_trip_photos_pkey PRIMARY KEY (cruise_trip_photo_id);


--
-- Name: cruise_trip cruise_trip_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cruise_trip
    ADD CONSTRAINT cruise_trip_pkey PRIMARY KEY (cruise_trip_id);


--
-- Name: cruise_trip_ports cruise_trip_ports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cruise_trip_ports
    ADD CONSTRAINT cruise_trip_ports_pkey PRIMARY KEY (cruise_trip_id, cruise_trip_day);


--
-- Name: cruise_trip_staff cruise_trip_staff_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cruise_trip_staff
    ADD CONSTRAINT cruise_trip_staff_pkey PRIMARY KEY (cruise_trip_staff_id);


--
-- Name: passenger passenger_login_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.passenger
    ADD CONSTRAINT passenger_login_id_key UNIQUE (login_id);


--
-- Name: passenger passenger_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.passenger
    ADD CONSTRAINT passenger_pkey PRIMARY KEY (passenger_id);


--
-- Name: staff_position staff_position_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_position
    ADD CONSTRAINT staff_position_pkey PRIMARY KEY (staff_position_id);


--
-- PostgreSQL database dump complete
--

