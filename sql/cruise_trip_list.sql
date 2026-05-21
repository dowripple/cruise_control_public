/*
  SELECT *
    FROM cruise_trip;
*/	

  SELECT ct.cruise_trip_id,  		 
		 cs.cruise_line_id,
		 cl.cruise_line,
		 cl.cruise_line_abbr,
		 cl.cruise_line_url,
		 cl.cruise_line_reward_program,
		 cs.cruise_ship_id,
		 cs.ship_name,
		 cs.year_built,
		 cs.occupancy,
		 cs.ship_class,
		 cs.casino_deck_number,
		 cs.lounge_deck_number,
		 cs.restaurant_deck_number,
		 cs.retreat_deck_number,
		 ct.departure_date,
		 ct.arrival_date,
		 ct.book_date,
		 ct.deck_number,
		 ct.room_number,
		 ct.suite_yn,
		 ct.trip_cost,
		 ct.amount_paid,
		 ct.club_points,
		 ct.departure_port_id,
		 p1.cruise_port AS departure_port,
		 p1.city AS departure_port_city,
		 p1.state AS departure_port_state,
		 p1.latitude AS departure_port_latitude,
		 p1.longitude AS departure_port_longitude,
		 ct.arrival_port_id,
		 p2.cruise_port AS arrival_port,
		 p2.city AS arrival_port_city,
		 p2.state AS arrival_port_state,
		 p2.latitude AS arrival_port_latitude,
		 p2.longitude AS arrival_port_longitude,
		 ct.amount_due_date,
		 ct.trip_notes,
		 ct.agent_yn,
		 ct.cruise_name,
		 ct.agent_name,
		 ct.cruise_length_days
    FROM cruise_trip ct INNER JOIN cruise_ship cs
	  ON ct.cruise_ship_id = cs.cruise_ship_id INNER JOIN cruise_line cl
	  ON cs.cruise_line_id = cl.cruise_line_id INNER JOIN cruise_port p1
	  ON ct.departure_port_id = p1.cruise_port_id INNER JOIN cruise_port p2
	  ON ct.arrival_port_id = p2.cruise_port_id;