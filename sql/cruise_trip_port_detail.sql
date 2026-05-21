
  SELECT ctp.cruise_trip_id,
  		 ctp.cruise_trip_day,
		 ctp.cruise_trip_date,
		 ctp.cruise_port_id,
		 ctp.cruise_trip_comment,
		 cp.cruise_port,
		 cp.city,
		 cp.state,
		 cp.latitude,
		 cp.longitude,
		 CASE WHEN ctp.cruise_trip_date < '2025-12-28' THEN 1 ELSE 0 END AS visited_yn,
		 CASE WHEN ctp.cruise_trip_date < '2025-12-28' THEN 'Been there!' ELSE 'Will be there soon' END AS visited_message
    FROM cruise_trip_ports ctp INNER JOIN cruise_port cp
	  ON ctp.cruise_port_id = cp.cruise_port_id 
ORDER BY ctp.cruise_trip_date	  