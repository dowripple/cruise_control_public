
    WITH current_points
	  AS
 	   (
		  SELECT SUM(club_points) AS current_club_point_total
			FROM cruise_trip
		   WHERE arrival_date < '2025-12-28'
	   ),
	     cruise_stop_group
	  AS
	   (
		  SELECT ctp.cruise_trip_id,
		   		 MIN(ctp.cruise_trip_day) AS cruise_trip_day,
				 cp.city || ' (' || cp.state || ')' || CASE WHEN COUNT(*) > 1 THEN ' x' || CAST(COUNT(*) AS VARCHAR) ELSE '' END AS cruise_port
			FROM cruise_trip_ports ctp INNER JOIN cruise_port cp
			  ON ctp.cruise_port_id = cp.cruise_port_id INNER JOIN cruise_trip ct
		      ON ctp.cruise_trip_id = ct.cruise_trip_id
		   WHERE ct.departure_port_id <> ctp.cruise_port_id
		     AND ct.arrival_port_id <> ctp.cruise_port_id	
		GROUP BY ctp.cruise_trip_id,
				 cp.city || ' (' || cp.state || ')'		   
	   ),
	     cruise_stops
	  AS
	   (
		  SELECT csg.cruise_trip_id,
				 STRING_AGG(csg.cruise_port, ', ' ORDER BY csg.cruise_trip_day) AS cruise_port_list
			FROM cruise_stop_group csg
		GROUP BY csg.cruise_trip_id		   
	   )
  SELECT ct.cruise_trip_id,
  		 ROW_NUMBER() OVER (ORDER BY departure_date) AS cruise_trip_order,
  		 cs.cruise_line_id,
		 cl.cruise_line,
		 cl.cruise_line_abbr,
		 cl.cruise_line_url,
		 cl.company_id,
		 cmp.company_name,
		 cmp.company_abbr,
		 cmp.company_url,
  		 ct.cruise_ship_id,
		 cs.ship_name,
		 cs.year_built,
		 cs.occupancy,
		 cs.ship_class,
		 ct.departure_date,
		 ct.arrival_date,
		 css.cruise_port_list,
		 ct.book_date,
		 ct.deck_number,
		 ct.room_number,
		 ct.suite_yn,
		 ct.trip_cost,
		 ct.amount_paid,
		 ct.club_points,
		 ct.cruise_name,
		 ct.agent_yn,
		 ct.agent_name,
		 ct.cruise_length_days,
		 cp.current_club_point_total,
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
		 p2.longitude AS arrival_port_longitude
    FROM cruise_trip ct INNER JOIN cruise_ship cs
	  ON ct.cruise_ship_id = cs.cruise_ship_id INNER JOIN cruise_line cl
	  ON cs.cruise_line_id = cl.cruise_line_id INNER JOIN company cmp
	  ON cl.company_id = cmp.company_id CROSS JOIN current_points cp INNER JOIN cruise_port p1
	  ON ct.departure_port_id = p1.cruise_port_id INNER JOIN cruise_port p2
	  ON ct.arrival_port_id = p2.cruise_port_id INNER JOIN cruise_stops css
	  ON ct.cruise_trip_id = css.cruise_trip_id;
	


	
/*
Cruise trip 10
Day 1 - Ft L					1
Day 2 - at sea
Day 3 - Key West				12
Day 4 - Grand Bahama island		32
Day 5 - Ft. L					1

Cruise trip 11
Day 1 - San juan				4
Day 2 - St Maartin				33
Day 3 - at sea
Day 4 - at sea
Day 5 - ft. L					1

*/