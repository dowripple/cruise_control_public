$( document ).ready(function() {
 
    // base url for flask app
	// Relative path so the app works from any host that serves it
	// (localhost, Tailscale IP, MagicDNS hostname, etc.) without edits.
	var base_url = '/'

    const current_year = new Date().getFullYear();
    var mapbox_key = $('#mapbox_key').val();

    function unwrapLon(lon, prevLon) {
        if (prevLon === null) return lon;
        let delta = lon - prevLon;
        if (delta > 180) lon -= 360;
        else if (delta < -180) lon += 360;
        return lon;
    }
    $('#tabs_main').tabs({
        activate: function(event, ui) {
            var panelId = ui.newPanel.attr('id');
            if (panelId === 'tab_port') {
                var el = document.getElementById('port_chart');
                if (el && el.data) Plotly.Plots.resize(el);
            } else if (panelId === 'tab_cruise_trip') {
                var el = document.getElementById('cruise_map_chart');
                if (el && el.data) Plotly.Plots.resize(el);
            } else if (panelId === 'tab_traveler') {
                ensureTravelerCalendar();
            } else if (panelId === 'tab_photos') {
                loadPhotos();
            } else if (panelId === 'tab_insights') {
                loadInsights();
            }
        }
    });

    // Insights tab — lifetime stats + spending charts. Re-fetches each
    // activation so newly-added trips show up without a page reload.
    var COLOR_NAVY = '#0D2240';
    var COLOR_GOLD = '#BD9B60';
    var COLOR_GOLD_SOFT = '#D4B883';
    var COLOR_CREAM = '#F8F6F1';
    var COST_COMPONENTS = [
        { key: 'cruise_cost',      label: 'Cruise',     color: COLOR_NAVY },
        { key: 'airfare_cost',     label: 'Airfare',    color: COLOR_GOLD },
        { key: 'hotel_cost',       label: 'Hotel',      color: COLOR_GOLD_SOFT },
        { key: 'cat_sitter_cost',  label: 'Cat sitter', color: '#7A8AA0' }
    ];

    function fmtMoney(n) {
        if (n == null || isNaN(n)) return '$0';
        return '$' + Math.round(n).toLocaleString();
    }

    // Distinct color per cruise trip. Hash to a hue (golden-angle step keeps
    // adjacent trips visually far apart) and keep saturation/lightness fixed
    // so the navy/cream palette stays the dominant page voice.
    function cruiseFrameColor(cruiseTripId) {
        var n = Number(cruiseTripId) || 0;
        var hue = Math.round((n * 137.508) % 360);
        return 'hsl(' + hue + ', 55%, 38%)';
    }

    function fmtTripDate(iso) {
        if (!iso) return '';
        var s = String(iso).slice(0, 10);
        var parts = s.split('-');
        if (parts.length !== 3) return s;
        return parts[1] + '/' + parts[2] + '/' + parts[0].slice(2);
    }

    // Photo lightbox: shared between the Photos tab gallery and the
    // edit-trip dialog's Photos tab. Caller hands us a precomputed list
    // of photos so prev/next stays meaningful within whatever context
    // opened it (a single cruise on either page).
    var PHOTOS_PER_PAGE = 12;
    var photoCruises = {};
    var lightboxPhotos = [];
    var lightboxIndex = 0;

    function openLightbox(photos, index) {
        lightboxPhotos = photos || [];
        lightboxIndex = Math.max(0, Math.min(index || 0, lightboxPhotos.length - 1));
        $dialog_photo_view.dialog('option', 'width',
            Math.min(900, window.innerWidth * 0.95));
        renderLightbox();
        $dialog_photo_view.dialog('open');
    }

    function renderLightbox() {
        var p = lightboxPhotos[lightboxIndex];
        if (!p) return;
        $('#photo_view_image').attr('src', p.fullSrc);
        $('#photo_view_caption').text(p.caption || '').toggle(!!p.caption);
        $dialog_photo_view.dialog('option', 'title', p.dialogTitle);
        var n = lightboxPhotos.length;
        $('.ui-dialog-buttonpane button.photo-nav-prev').button(
            'option', 'disabled', n <= 1);
        $('.ui-dialog-buttonpane button.photo-nav-next').button(
            'option', 'disabled', n <= 1);
    }

    function lightboxNav(dir) {
        var n = lightboxPhotos.length;
        if (n <= 1) return;
        lightboxIndex = (lightboxIndex + dir + n) % n;
        renderLightbox();
    }

    var $dialog_photo_view = $('#dialog_photo_view').dialog({
        autoOpen: false, modal: true, title: 'Photo',
        width: Math.min(900, window.innerWidth * 0.95),
        buttons: [
            { text: '‹ Prev', class: 'ui-button ui-widget ui-corner-all photo-nav-prev',
              click: function() { lightboxNav(-1); }},
            { text: 'Next ›', class: 'ui-button ui-widget ui-corner-all photo-nav-next',
              click: function() { lightboxNav(1); }},
            { text: 'Close', class: 'ui-button ui-widget ui-corner-all', click: function() {
                $dialog_photo_view.dialog('close');
            }}
        ],
        close: function() {
            $('#photo_view_image').attr('src', '');
            lightboxPhotos = [];
            lightboxIndex = 0;
        }
    });

    $(document).on('keydown', function(e) {
        if (!$dialog_photo_view.dialog('isOpen')) return;
        if (e.key === 'ArrowLeft')  { lightboxNav(-1); e.preventDefault(); }
        else if (e.key === 'ArrowRight') { lightboxNav(1);  e.preventDefault(); }
    });

    $('#photos_gallery').on('click', '.photos-trip-thumb img', function() {
        var $img = $(this);
        var cruiseId = String($img.data('cruise-id'));
        var index = parseInt($img.data('photo-index'), 10) || 0;
        var cruise = photoCruises[cruiseId];
        if (!cruise) return;
        openLightbox(cruise.photos, index);
    });

    function setupCruisePager($trip) {
        var $thumbs = $trip.find('.photos-trip-thumb');
        var $pager = $trip.find('.photos-pager');
        var total = $thumbs.length;
        if (total <= PHOTOS_PER_PAGE) { $pager.hide(); return; }
        var pages = Math.ceil(total / PHOTOS_PER_PAGE);
        var current = 0;
        function render() {
            $thumbs.each(function(i) {
                var inPage = i >= current * PHOTOS_PER_PAGE
                          && i <  (current + 1) * PHOTOS_PER_PAGE;
                $(this).toggle(inPage);
            });
            $pager.find('.photos-pager-info').text(
                'Page ' + (current + 1) + ' of ' + pages);
            $pager.find('.photos-pager-prev').prop('disabled', current === 0);
            $pager.find('.photos-pager-next').prop('disabled', current === pages - 1);
        }
        $pager.find('.photos-pager-prev').on('click', function() {
            if (current > 0) { current--; render(); }
        });
        $pager.find('.photos-pager-next').on('click', function() {
            if (current < pages - 1) { current++; render(); }
        });
        render();
    }

    function loadPhotos() {
        var $gallery = $('#photos_gallery');
        $gallery.html('<div class="photos-empty">Loading photos…</div>');
        $.getJSON(base_url + 'data/all_photos', function(trips) {
            if (!trips || !trips.length) {
                $gallery.html('<div class="photos-empty">No photos uploaded yet.</div>');
                photoCruises = {};
                return;
            }
            photoCruises = {};
            var html = '';
            trips.forEach(function(t) {
                var color = cruiseFrameColor(t.cruise_trip_id);
                var dep = fmtTripDate(t.departure_date);
                var arr = fmtTripDate(t.arrival_date);
                var dateRange = dep && arr ? (dep + ' – ' + arr) : (dep || arr || '');
                var total = t.photos.length;
                var label = t.label || 'Cruise';
                var cruiseId = String(t.cruise_trip_id);
                photoCruises[cruiseId] = {
                    color: color,
                    photos: t.photos.map(function(p, i) {
                        return {
                            fullSrc: base_url + 'static/' + p.file_path,
                            caption: p.caption || '',
                            dialogTitle: label
                                + (dateRange ? ' · ' + dateRange : '')
                                + ' · Photo ' + (i + 1) + ' of ' + total
                        };
                    })
                };
                html += '<div class="photos-trip">';
                html +=   '<div class="photos-trip-header" style="border-left-color:'
                       + color + ';color:' + color + '">';
                html +=     '<span>' + $('<div>').text(label).html() + '</span>';
                if (dateRange) {
                    html +=   '<span class="photos-trip-dates">' + dateRange + '</span>';
                }
                html +=     '<span class="photos-trip-dates">' + total
                       + (total === 1 ? ' photo' : ' photos') + '</span>';
                html +=   '</div>';
                html +=   '<div class="photos-trip-grid">';
                t.photos.forEach(function(p, i) {
                    var titleParts = [label];
                    if (dateRange) titleParts.push(dateRange);
                    titleParts.push('Photo ' + (i + 1) + ' of ' + total);
                    var title = $('<div>').text(titleParts.join('\n')).html();
                    var src = base_url + 'static/' + p.file_path;
                    html += '<div class="photos-trip-thumb" style="border-color:'
                         + color + '">';
                    html +=   '<img src="' + src + '" alt="" loading="lazy"'
                          + ' title="' + title + '"'
                          + ' data-cruise-id="' + cruiseId + '"'
                          + ' data-photo-index="' + i + '">';
                    html += '</div>';
                });
                html +=   '</div>';
                html +=   '<div class="photos-pager">';
                html +=     '<button type="button" class="ui-button ui-widget ui-corner-all photos-pager-prev">‹ Prev</button>';
                html +=     '<span class="photos-pager-info"></span>';
                html +=     '<button type="button" class="ui-button ui-widget ui-corner-all photos-pager-next">Next ›</button>';
                html +=   '</div>';
                html += '</div>';
            });
            $gallery.html(html);
            $gallery.find('.photos-trip').each(function() {
                setupCruisePager($(this));
            });
        }).fail(function() {
            $gallery.html('<div class="photos-empty" style="color:#b00020">'
                       + 'Could not load photos.</div>');
        });
    }

    function wrapWords(text, maxLen) {
        var words = String(text || '').split(/\s+/).filter(Boolean);
        var lines = [], cur = '';
        words.forEach(function(w) {
            if (!cur) { cur = w; }
            else if (cur.length + 1 + w.length <= maxLen) { cur += ' ' + w; }
            else { lines.push(cur); cur = w; }
        });
        if (cur) lines.push(cur);
        return lines.join('<br>');
    }

    function loadInsights() {
        $.getJSON(base_url + 'data/insights', function(payload) {
            renderInsightsStats(payload.stats);
            renderInsightsByYear(payload.by_year);
            renderInsightsByLine(payload.by_line);
            renderInsightsPerCruise(payload.per_cruise);
            renderInsightsPerDay(payload.per_cruise);
            renderInsightsClubRace(payload.club_race);
        }).fail(function() {
            $('#insights_stats_grid').html(
                '<div style="color:#b00020">Could not load insights data.</div>');
        });
    }

    function renderInsightsStats(s) {
        function tile(value, label, sub) {
            var subHtml = sub ? '<span class="tile-sub">' + sub + '</span>' : '';
            return '<div class="insights-tile">' +
                   '<div class="tile-value">' + value + '</div>' +
                   '<div class="tile-label">' + label + '</div>' +
                   subHtml + '</div>';
        }
        var mostLine = s.most_cruised_line
            ? s.most_cruised_line + (s.most_cruised_line_count
                ? ' (' + s.most_cruised_line_count + ')' : '')
            : '—';
        var html =
            tile(s.cruises_taken || 0, 'Cruises taken',
                 s.upcoming_cruises ? s.upcoming_cruises + ' upcoming' : null) +
            tile((s.days_at_sea || 0).toLocaleString(), 'Days at sea') +
            tile(s.distinct_ports || 0, 'Distinct ports') +
            tile(s.distinct_ships || 0, 'Distinct ships') +
            tile(s.exceptional_staff || 0, 'Exceptional staff') +
            tile((s.photos_collected || 0).toLocaleString(), 'Photos collected') +
            tile(fmtMoney(s.lifetime_spent), 'Lifetime spent') +
            tile(s.cruise_cost_per_day != null ? fmtMoney(s.cruise_cost_per_day) : '—',
                 'Cruise cost / day') +
            tile((s.lifetime_club_points || 0).toLocaleString(), 'Club points') +
            tile(mostLine, 'Most-cruised line');
        $('#insights_stats_grid').html(html);
    }

    function renderInsightsByYear(rows) {
        if (!rows || !rows.length) {
            Plotly.purge('insights_chart_year'); return;
        }
        var years = rows.map(function(r) { return r.year; });
        var traces = COST_COMPONENTS.map(function(c) {
            return {
                type: 'bar', name: c.label, marker: { color: c.color },
                x: years, y: rows.map(function(r) { return r[c.key] || 0; }),
                hovertemplate: c.label + ': %{y:$,.0f}<extra></extra>'
            };
        });
        var totals = rows.map(function(r) {
            return COST_COMPONENTS.reduce(function(s, c) { return s + (r[c.key] || 0); }, 0);
        });
        traces.push({
            type: 'scatter', mode: 'text', x: years, y: totals,
            text: totals.map(function(v) { return '$' + Math.round(v).toLocaleString(); }),
            textposition: 'top center', textfont: { size: 11, color: '#333' },
            showlegend: false, hoverinfo: 'skip', cliponaxis: false
        });
        Plotly.newPlot('insights_chart_year', traces, {
            barmode: 'stack',
            margin: { t: 20, r: 10, b: 40, l: 60 },
            xaxis: { type: 'category', title: '' },
            yaxis: { tickprefix: '$', tickformat: ',.0f' },
            legend: { orientation: 'h', y: -0.2 }
        }, { responsive: true, displayModeBar: false });
    }

    function renderInsightsByLine(rows) {
        if (!rows || !rows.length) {
            Plotly.purge('insights_chart_line'); return;
        }
        // Reverse so the largest bar sits at the top of a horizontal bar.
        var sorted = rows.slice().reverse();
        var trace = {
            type: 'bar', orientation: 'h',
            y: sorted.map(function(r) { return r.cruise_line; }),
            x: sorted.map(function(r) { return r.total_cost || 0; }),
            text: sorted.map(function(r) { return r.trip_count + ' trips'; }),
            textposition: 'auto',
            marker: { color: COLOR_GOLD },
            hovertemplate: '%{y}: %{x:$,.0f}<br>%{text}<extra></extra>'
        };
        Plotly.newPlot('insights_chart_line', [trace], {
            margin: { t: 10, r: 10, b: 40, l: 130 },
            xaxis: { tickprefix: '$', tickformat: ',.0f' },
            yaxis: { automargin: true }
        }, { responsive: true, displayModeBar: false });
    }

    function renderInsightsPerCruise(rows) {
        if (!rows || !rows.length) {
            Plotly.purge('insights_chart_per_cruise'); return;
        }
        var labels = rows.map(function(r) {
            var date = (r.departure_date || '').slice(0,10);
            var wrapped = wrapWords(r.label || '', 14);
            return date ? wrapped + '<br>(' + date + ')' : wrapped;
        });
        var traces = COST_COMPONENTS.map(function(c) {
            return {
                type: 'bar', name: c.label, marker: { color: c.color },
                x: labels, y: rows.map(function(r) { return r[c.key] || 0; }),
                hovertemplate: c.label + ': %{y:$,.0f}<extra></extra>'
            };
        });
        var totals = rows.map(function(r) {
            return COST_COMPONENTS.reduce(function(s, c) { return s + (r[c.key] || 0); }, 0);
        });
        traces.push({
            type: 'scatter', mode: 'text', x: labels, y: totals,
            text: totals.map(function(v) { return '$' + Math.round(v).toLocaleString(); }),
            textposition: 'top center', textfont: { size: 11, color: '#333' },
            showlegend: false, hoverinfo: 'skip', cliponaxis: false
        });
        Plotly.newPlot('insights_chart_per_cruise', traces, {
            barmode: 'stack',
            margin: { t: 20, r: 10, b: 60, l: 60 },
            xaxis: { tickangle: 0, automargin: true, tickfont: { size: 10 } },
            yaxis: { tickprefix: '$', tickformat: ',.0f' },
            legend: { orientation: 'h', y: -0.25 }
        }, { responsive: true, displayModeBar: false });
    }

    function renderInsightsClubRace(race) {
        var $row = $('#insights_club_race_row');
        if (!race || !race.passengers || !race.passengers.length) {
            Plotly.purge('insights_chart_club_race');
            $row.hide();
            return;
        }
        $row.show();
        var line = race.cruise_line || 'Captain\'s Club';
        $('#insights_club_race_title').text(
            (line === 'Celebrity Cruises' ? "Captain's Club Race 🏆" : line + ' Race 🏆')
            + " — who'll get to the lounge first?");

        var passengers = race.passengers;
        var milestones = (race.milestones || []).filter(function(m) { return m.min_points > 0; });
        var maxCurrent = 0;
        passengers.forEach(function(p) { if (p.current_points > maxCurrent) maxCurrent = p.current_points; });
        // Extend axis just past the next unreached milestone so "next tier"
        // tension is visible without dwarfing current bars.
        var nextMilestone = milestones.find(function(m) { return m.min_points > maxCurrent; });
        var axisMax;
        if (nextMilestone) {
            axisMax = Math.ceil((nextMilestone.min_points * 1.1) / 10) * 10;
        } else {
            axisMax = Math.max(maxCurrent * 1.2, 10);
        }

        var trace = {
            type: 'bar', orientation: 'h',
            y: passengers.map(function(p) { return p.passenger_name; }),
            x: passengers.map(function(p) { return p.current_points; }),
            text: passengers.map(function(p) {
                var lvl = p.program_level_name ? ' · ' + p.program_level_name : '';
                return p.current_points + ' pts' + lvl;
            }),
            textposition: 'outside',
            cliponaxis: false,
            marker: { color: COLOR_GOLD, line: { color: COLOR_NAVY, width: 1 } },
            hovertemplate: '%{y}<br>%{x} points<extra></extra>'
        };
        var shapes = milestones
            .filter(function(m) { return m.min_points <= axisMax; })
            .map(function(m) {
                return {
                    type: 'line',
                    x0: m.min_points, x1: m.min_points,
                    yref: 'paper', y0: 0, y1: 1,
                    line: { color: COLOR_NAVY, width: 1, dash: 'dash' }
                };
            });
        var annotations = milestones
            .filter(function(m) { return m.min_points <= axisMax; })
            .map(function(m) {
                return {
                    x: m.min_points,
                    yref: 'paper', y: 1.04,
                    text: m.program_level_name + '<br>' + m.min_points,
                    showarrow: false,
                    font: { size: 10, color: COLOR_NAVY },
                    align: 'center'
                };
            });
        Plotly.newPlot('insights_chart_club_race', [trace], {
            margin: { t: 50, r: 110, b: 40, l: 130 },
            xaxis: { range: [0, axisMax], title: 'Captain\'s Club points',
                     tickformat: ',d' },
            yaxis: { automargin: true },
            shapes: shapes,
            annotations: annotations
        }, { responsive: true, displayModeBar: false });
    }

    function renderInsightsPerDay(rows) {
        var withDay = (rows || []).filter(function(r) {
            return r.cost_per_day != null && r.departure_date;
        });
        if (!withDay.length) {
            Plotly.purge('insights_chart_per_day'); return;
        }
        var trace = {
            type: 'scatter', mode: 'lines+markers',
            x: withDay.map(function(r) { return (r.departure_date || '').slice(0,10); }),
            y: withDay.map(function(r) { return r.cost_per_day; }),
            text: withDay.map(function(r) { return r.label; }),
            line: { color: COLOR_NAVY, width: 2 },
            marker: { color: COLOR_GOLD, size: 9 },
            hovertemplate: '%{text}<br>%{x}<br>%{y:$,.0f}/day<extra></extra>'
        };
        Plotly.newPlot('insights_chart_per_day', [trace], {
            margin: { t: 10, r: 10, b: 50, l: 60 },
            xaxis: { type: 'date' },
            yaxis: { tickprefix: '$', tickformat: ',.0f' }
        }, { responsive: true, displayModeBar: false });
    }

    // FullCalendar instance for the travelers tab. Lazy-init on first tab
    // activation so the container has its real width when the calendar lays
    // itself out (FullCalendar measures the DOM at init time).
    var travelerCalendar = null;
    function ensureTravelerCalendar() {
        var el = document.getElementById('traveler_cruise_calendar');
        if (!el || typeof FullCalendar === 'undefined') return;
        if (travelerCalendar) {
            travelerCalendar.refetchEvents();
            travelerCalendar.updateSize();
            return;
        }
        travelerCalendar = new FullCalendar.Calendar(el, {
            initialView: 'dayGridMonth',
            height: 520,
            headerToolbar: {
                left: 'prev,next today',
                center: 'title',
                right: 'dayGridMonth,listYear'
            },
            events: base_url + 'data/cruise_trip_calendar',
            eventColor: '#0D2240',
            eventDidMount: function(info) {
                // Native title attribute -> hover tooltip on desktop,
                // long-press tooltip on tablet. Combines all the event details.
                var p = info.event.extendedProps || {};
                if (p.kind === 'event') {
                    var lines = [];
                    var when = p.eventDate || '';
                    if (p.eventTime) when += ' ' + p.eventTime;
                    if (when) lines.push(when);
                    if (p.eventName) lines.push(p.eventName);
                    if (p.eventLocation) lines.push('@ ' + p.eventLocation);
                    if (p.eventNotes) lines.push('', p.eventNotes);
                    info.el.title = lines.join('\n');
                } else {
                    info.el.title = info.event.title;
                }
            },
            eventClick: function(info) {
                info.jsEvent.preventDefault();
                var p = info.event.extendedProps || {};
                if (p.kind === 'event') {
                    openEventDetailDialog(p);
                    return;
                }
                var tripId = p.tripId || parseInt(info.event.id, 10);
                if (tripId) openTripDialog('edit', tripId);
            }
        });
        travelerCalendar.render();
    }

    var $dialog_event_detail = $('#dialog_event_detail').dialog({
        autoOpen: false, modal: true, title: 'Event',
        width: Math.min(440, window.innerWidth * 0.9),
        buttons: [
            { text: 'Open trip', class: 'ui-button ui-widget ui-corner-all', click: function() {
                var tripId = $dialog_event_detail.data('tripId');
                $dialog_event_detail.dialog('close');
                if (tripId) openTripDialog('edit', tripId);
            }},
            { text: 'Close', class: 'ui-button ui-widget ui-corner-all', click: function() {
                $dialog_event_detail.dialog('close');
            }}
        ]
    });

    function openEventDetailDialog(p) {
        var when = p.eventDate || '';
        if (p.eventTime) when += ' at ' + p.eventTime;
        $('#event_detail_when').text(when);
        $('#event_detail_name').text(p.eventName || '');
        $('#event_detail_location').text(p.eventLocation ? '@ ' + p.eventLocation : '');
        $('#event_detail_notes').text(p.eventNotes || '');
        $dialog_event_detail.data('tripId', p.tripId || null);
        $dialog_event_detail.dialog('open');
    }

    $('#current_year').text(current_year)

    // dialog box setup
    // set the dimensions
    var window_width = $(window).width();
    var window_height = $(window).height();
    var dialog_width = window_width * 0.8;
    var dialog_height = Math.max(700, window_height - 20);

    var $dialog_trip_detail = $('#dialog_trip_detail').dialog({
        autoOpen: false,
        modal: true,
        title: 'Cruise trip',
        width: dialog_width,
        height: dialog_height,
        buttons: [
            {
                text: "Print",
                class: "ui-button ui-widget ui-corner-all",
                click: function() {
                    var tripId = $('#trip_detail_cruise_trip_id').val();
                    if (!tripId) {
                        alert('Save the trip first before printing.');
                        return;
                    }
                    window.open(base_url + 'cruise_trip/' + tripId + '/print',
                                '_blank', 'noopener');
                }
            },
            {
                text: "Save",
                class: "ui-button ui-widget ui-corner-all",
                click: function() {
                    saveTrip().done(function() {
                        if (typeof $table_cruise_list !== 'undefined') {
                            $table_cruise_list.ajax.reload(null, false);
                        }
                        $dialog_trip_detail.dialog('close');
                    }).fail(function(xhr) {
                        if (xhr && xhr.responseText) alert('Save failed: ' + xhr.responseText);
                    });
                }
            },
            {
                text: "Cancel",
                class: "ui-button ui-widget ui-corner-all",
                click: function() {
                    $dialog_trip_detail.dialog('close');
                }
            }
        ]
    });
    // Inject haiku display into the trip-detail dialog footer, just above the buttons.
    $dialog_trip_detail.dialog('widget')
        .find('.ui-dialog-buttonpane')
        .before('<div id="trip_detail_haiku_footer" style="font-style:italic;text-align:center;padding:6px 12px;white-space:pre-line;border-top:1px solid #ddd;background:#fafafa"></div>');

    function updateHaikuFooter(text) {
        var $f = $('#trip_detail_haiku_footer');
        var t = (text || '').trim();
        $f.text(t);
        $f.toggle(t.length > 0);
    }
    $(document).on('input', '#trip_detail_trip_haiku', function() {
        updateHaikuFooter($(this).val());
    });

    //dialog tabs
    var musicTabVisited = false;  // reset per dialog open; gates mini player parking
    $('#trip_detail_tabs').tabs({
        activate: function(event, ui) {
            if (ui.newPanel && ui.newPanel.attr('id') === 'trip_detail_tab_music') {
                musicTabVisited = true;
            }
        }
    });

    // ---- Trip edit dialog logic ----
    var tripLookups = { cruise_lines: [], cruise_ships: [], ports: [], companies: [], staff_positions: [], airlines: [], cruise_line_reward_levels: [], passengers: [] };
    var tripLookupsLoaded = false;

    function loadTripLookups() {
        if (tripLookupsLoaded) return $.Deferred().resolve().promise();
        return $.when(
            $.getJSON(base_url + 'data/lookups/cruise_lines'),
            $.getJSON(base_url + 'data/lookups/cruise_ships'),
            $.getJSON(base_url + 'data/lookups/ports'),
            $.getJSON(base_url + 'data/lookups/companies'),
            $.getJSON(base_url + 'data/lookups/staff_positions'),
            $.getJSON(base_url + 'data/lookups/airlines'),
            $.getJSON(base_url + 'data/lookups/cruise_line_reward_levels'),
            $.getJSON(base_url + 'data/lookups/passengers')
        ).then(function(linesResp, shipsResp, portsResp, companiesResp, positionsResp, airlinesResp, rewardLevelsResp, passengersResp) {
            tripLookups.cruise_lines = linesResp[0];
            tripLookups.cruise_ships = shipsResp[0];
            tripLookups.ports = portsResp[0];
            tripLookups.companies = companiesResp[0];
            tripLookups.staff_positions = positionsResp[0];
            tripLookups.airlines = airlinesResp[0];
            tripLookups.cruise_line_reward_levels = rewardLevelsResp[0];
            tripLookups.passengers = passengersResp[0];
            tripLookupsLoaded = true;
        });
    }

    function refreshLookup(kind) {
        var urls = {
            cruise_lines: 'data/lookups/cruise_lines',
            cruise_ships: 'data/lookups/cruise_ships',
            ports: 'data/lookups/ports',
            companies: 'data/lookups/companies',
            staff_positions: 'data/lookups/staff_positions',
            airlines: 'data/lookups/airlines',
            cruise_line_reward_levels: 'data/lookups/cruise_line_reward_levels',
            passengers: 'data/lookups/passengers'
        };
        return $.getJSON(base_url + urls[kind]).then(function(r) {
            tripLookups[kind] = r;
        });
    }

    function rebuildPortSelects() {
        var deptVal = $('#trip_detail_departure_port_id').val();
        var arrVal = $('#trip_detail_arrival_port_id').val();
        fillSelect($('#trip_detail_departure_port_id'), tripLookups.ports, 'cruise_port_id', portLabel, deptVal);
        fillSelect($('#trip_detail_arrival_port_id'), tripLookups.ports, 'cruise_port_id', portLabel, arrVal);
        $('#trip_ports_table tbody tr').each(function() {
            var $sel = $(this).find('.trip-port-id');
            var current = $sel.val();
            var html = '<option value="">-- select port --</option>';
            tripLookups.ports.forEach(function(p) {
                var sel = String(p.cruise_port_id) === String(current) ? ' selected' : '';
                html += '<option value="' + p.cruise_port_id + '"' + sel + '>' +
                    escapeHtml(portLabel(p)) + '</option>';
            });
            $sel.html(html);
        });
    }

    function fillSelect($sel, items, valueKey, labelFn, currentValue) {
        $sel.empty();
        $sel.append($('<option>').val('').text('-- select --'));
        items.forEach(function(item) {
            $sel.append($('<option>').val(item[valueKey]).text(labelFn(item)));
        });
        if (currentValue != null && currentValue !== '') $sel.val(currentValue);
    }

    function portLabel(p) {
        return p.cruise_port + ' (' + p.city + ', ' + p.state + ')';
    }

    function refreshShipsDropdown(currentShipId) {
        var lineId = $('#trip_detail_cruise_line_id').val();
        var ships = tripLookups.cruise_ships.filter(function(s) {
            return !lineId || String(s.cruise_line_id) === String(lineId);
        });
        fillSelect($('#trip_detail_cruise_ship_id'), ships, 'cruise_ship_id',
            function(s) { return s.ship_name; }, currentShipId);
        loadShipImage($('#trip_detail_cruise_ship_id').val());
    }

    function loadShipImage(shipId) {
        var $row = $('#trip_detail_ship_image_row');
        var $img = $('#trip_detail_ship_image');
        var $cap = $('#trip_detail_ship_image_caption');
        $row.hide();
        $img.removeAttr('src');
        $cap.text('');
        if (!shipId) return;
        var ship = tripLookups.cruise_ships.find(function(s) {
            return String(s.cruise_ship_id) === String(shipId);
        });
        var line = ship && tripLookups.cruise_lines.find(function(l) {
            return String(l.cruise_line_id) === String(ship.cruise_line_id);
        });
        var caption = ship ? ((line ? line.cruise_line + ' ' : '') + ship.ship_name) : '';
        var exts = ['jpg', 'jpeg', 'png', 'webp'];
        var i = 0;
        function tryNext() {
            if (i >= exts.length) return;
            var url = base_url + 'static/images/ships/' + shipId + '.' + exts[i++];
            var probe = new Image();
            probe.onload = function() {
                $img.attr('src', url).attr('alt', caption);
                $cap.text(caption);
                $row.show();
            };
            probe.onerror = tryNext;
            probe.src = url;
        }
        tryNext();
    }

    function populateTripDropdowns(trip) {
        fillSelect($('#trip_detail_cruise_line_id'), tripLookups.cruise_lines, 'cruise_line_id',
            function(l) { return l.cruise_line; }, trip.cruise_line_id);
        refreshShipsDropdown(trip.cruise_ship_id);
        fillSelect($('#trip_detail_departure_port_id'), tripLookups.ports, 'cruise_port_id',
            portLabel, trip.departure_port_id);
        fillSelect($('#trip_detail_arrival_port_id'), tripLookups.ports, 'cruise_port_id',
            portLabel, trip.arrival_port_id);
    }

    $('#trip_detail_cruise_line_id').on('change', function() {
        refreshShipsDropdown(null);
    });

    $('#trip_detail_cruise_ship_id').on('change', function() {
        loadShipImage($(this).val());
    });

    function clearTripFields() {
        $('#trip_detail_cruise_trip_id, #trip_detail_cruise_name').val('');
        $('#trip_detail_departure_date, #trip_detail_arrival_date, #trip_detail_book_date').val('');
        $('#trip_detail_cruise_length_days, #trip_detail_deck_number, #trip_detail_room_number').val('');
        $('#trip_detail_agent_name, #trip_detail_trip_notes, #trip_detail_trip_haiku, #trip_detail_cat_sitter').val('');
        updateHaikuFooter('');
        $('#trip_detail_suite_yn, #trip_detail_agent_yn').prop('checked', false);
        $('#trip_detail_trip_cost, #trip_detail_amount_paid, #trip_detail_amount_due_date').val('');
        $('#trip_detail_club_points, #trip_detail_airfare_cost, #trip_detail_hotel_cost, #trip_detail_cat_sitter_cost').val('');
        $('#trip_detail_total_cost, #trip_detail_total_per_day, #trip_detail_trip_cost_per_day, #trip_detail_paid_percent').val('');
        $('#trip_detail_apple_music_url').val('');
        $('#trip_music_embed_wrap').empty();
        $('#trip_detail_need_airfare_yn, #trip_detail_airfare_purchased_yn, ' +
          '#trip_detail_need_hotel_yn, #trip_detail_hotel_booked_yn').prop('checked', false);
        $('#trip_ports_table tbody').empty();
        $('#trip_staff_table tbody').empty();
        $('#trip_event_table tbody').empty();
    }

    function setTripFields(trip) {
        clearTripFields();
        $('#trip_detail_cruise_trip_id').val(trip.cruise_trip_id || '');
        $('#trip_detail_cruise_name').val(trip.cruise_name || '');
        $('#trip_detail_departure_date').val(trip.departure_date || '');
        $('#trip_detail_arrival_date').val(trip.arrival_date || '');
        $('#trip_detail_book_date').val(trip.book_date || '');
        $('#trip_detail_cruise_length_days').val(trip.cruise_length_days != null ? trip.cruise_length_days : '');
        $('#trip_detail_deck_number').val(trip.deck_number != null ? trip.deck_number : '');
        $('#trip_detail_room_number').val(trip.room_number != null ? trip.room_number : '');
        $('#trip_detail_agent_name').val(trip.agent_name || '');
        $('#trip_detail_cat_sitter').val(trip.cat_sitter || '');
        $('#trip_detail_trip_notes').val(trip.trip_notes || '');
        $('#trip_detail_trip_haiku').val(trip.trip_haiku || '');
        updateHaikuFooter(trip.trip_haiku || '');
        $('#trip_detail_apple_music_url').val(trip.apple_music_url || '');
        renderAppleMusicEmbed(trip.apple_music_url || '', trip.cruise_trip_id);
        $('#trip_detail_suite_yn').prop('checked', trip.suite_yn === '1');
        $('#trip_detail_agent_yn').prop('checked', trip.agent_yn === '1');
        $('#trip_detail_trip_cost').val(trip.trip_cost || '');
        $('#trip_detail_amount_paid').val(trip.amount_paid || '');
        $('#trip_detail_amount_due_date').val(trip.amount_due_date || '');
        $('#trip_detail_club_points').val(trip.club_points != null ? trip.club_points : '');
        $('#trip_detail_airfare_cost').val(trip.airfare_cost || '');
        $('#trip_detail_hotel_cost').val(trip.hotel_cost || '');
        $('#trip_detail_cat_sitter_cost').val(trip.cat_sitter_cost || '');
        $('#trip_detail_need_airfare_yn').prop('checked', trip.need_airfare_yn === '1');
        $('#trip_detail_airfare_purchased_yn').prop('checked', trip.airfare_purchased_yn === '1');
        $('#trip_detail_need_hotel_yn').prop('checked', trip.need_hotel_yn === '1');
        $('#trip_detail_hotel_booked_yn').prop('checked', trip.hotel_booked_yn === '1');
        populateTripDropdowns(trip);
        (trip.ports || []).forEach(function(p) { addItineraryRow(p); });
        (trip.staff || []).forEach(function(s) { addStaffRow(s); });
        (trip.events || []).forEach(function(e) { addEventRow(e); });
        recalcTripTotals();
        updatePurchaseSearchVisibility();
    }

    function parseMoney(s) {
        if (s == null || s === '') return 0;
        var n = parseFloat(String(s).replace(/[$,\s]/g, ''));
        return isNaN(n) ? 0 : n;
    }
    function formatMoney(n) {
        return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    function recalcTripTotals() {
        var trip = parseMoney($('#trip_detail_trip_cost').val());
        var paid = parseMoney($('#trip_detail_amount_paid').val());
        var total = trip +
                    parseMoney($('#trip_detail_airfare_cost').val()) +
                    parseMoney($('#trip_detail_hotel_cost').val()) +
                    parseMoney($('#trip_detail_cat_sitter_cost').val());
        var days = parseInt($('#trip_detail_cruise_length_days').val(), 10);
        $('#trip_detail_total_cost').val(formatMoney(total));
        $('#trip_detail_total_per_day').val(days > 0 ? formatMoney(total / days) : '');
        $('#trip_detail_trip_cost_per_day').val(days > 0 && trip > 0 ? formatMoney(trip / days) : '');
        $('#trip_detail_paid_percent').val(trip > 0 ? (paid / trip * 100).toFixed(1) + '%' : '');
    }
    $('#trip_detail_trip_cost, #trip_detail_amount_paid, #trip_detail_airfare_cost, ' +
      '#trip_detail_hotel_cost, #trip_detail_cat_sitter_cost, #trip_detail_cruise_length_days')
        .on('input change', recalcTripTotals);

    function updatePurchaseSearchVisibility() {
        $('#trip_detail_search_flights').toggle(!$('#trip_detail_airfare_purchased_yn').is(':checked'));
        $('#trip_detail_search_hotels').toggle(!$('#trip_detail_hotel_booked_yn').is(':checked'));
    }
    $('#trip_detail_airfare_purchased_yn, #trip_detail_hotel_booked_yn')
        .on('change', updatePurchaseSearchVisibility);

    function lookupPort(id) {
        if (!id) return null;
        return tripLookups.ports.find(function(p) { return String(p.cruise_port_id) === String(id); });
    }
    function portCity(p) {
        if (!p) return '';
        var label = p.city || p.cruise_port || '';
        if (p.state) label += ' ' + p.state;
        return label.trim();
    }
    function dayBefore(isoDate) {
        if (!isoDate) return '';
        var d = new Date(isoDate + 'T12:00:00');
        d.setDate(d.getDate() - 1);
        return d.toISOString().substring(0, 10);
    }
    function readableDate(isoDate) {
        if (!isoDate) return '';
        var d = new Date(isoDate + 'T12:00:00');
        return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    }

    function travelersHomeCity() {
        var cities = (tripLookups.passengers || [])
            .map(function(p) { return (p.home_city || '').trim(); })
            .filter(Boolean);
        if (!cities.length) return '';
        var unique = cities.filter(function(c, i) { return cities.indexOf(c) === i; });
        return unique.length === 1 ? unique[0] : cities[0];
    }
    function travelersHomeAirport() {
        var codes = (tripLookups.passengers || [])
            .map(function(p) { return (p.home_airport || '').trim().toUpperCase(); })
            .filter(Boolean);
        if (!codes.length) return '';
        var unique = codes.filter(function(c, i) { return codes.indexOf(c) === i; });
        return unique.length === 1 ? unique[0] : codes[0];
    }

    $('#trip_detail_search_flights').on('click', function() {
        var dept = lookupPort($('#trip_detail_departure_port_id').val());
        var arr = lookupPort($('#trip_detail_arrival_port_id').val());
        var deptDate = $('#trip_detail_departure_date').val();
        var arrDate = $('#trip_detail_arrival_date').val();
        if (!dept || !deptDate) {
            alert('Set the departure port and departure date first.');
            return;
        }
        // Google Flights' free-text q= parser handles city names + ISO dates more
        // reliably than IATA codes, so prefer cities and fall back to airport codes.
        var origin = travelersHomeCity() || travelersHomeAirport();
        var destOut = portCity(dept) || (dept.nearest_airport || '').toUpperCase();
        var outDate = dayBefore(deptDate);
        var pax = (tripLookups.passengers || []).length || 1;
        var query = 'Flights from ' + origin + ' to ' + destOut +
                    ' on ' + outDate;
        if (arr && arrDate) {
            query += ' through ' + arrDate;
        }
        query += ' for ' + pax + ' ' + (pax === 1 ? 'adult' : 'adults');
        window.open('https://www.google.com/travel/flights?q=' + encodeURIComponent(query),
                    '_blank', 'noopener');
    });

    $('#trip_detail_search_hotels').on('click', function() {
        var dept = lookupPort($('#trip_detail_departure_port_id').val());
        var deptDate = $('#trip_detail_departure_date').val();
        if (!dept || !deptDate) {
            alert('Set the departure port and departure date first.');
            return;
        }
        var checkIn = readableDate(dayBefore(deptDate));
        var checkOut = readableDate(deptDate);
        var query = 'hotels near ' + portCity(dept) +
                    ' check in ' + checkIn + ' check out ' + checkOut;
        window.open('https://www.google.com/search?q=' + encodeURIComponent(query),
                    '_blank', 'noopener');
    });

    function escapeHtml(s) {
        return $('<div>').text(s == null ? '' : s).html();
    }

    function addItineraryRow(port) {
        port = port || {};
        var portOptions = '<option value="">-- select port --</option>';
        tripLookups.ports.forEach(function(p) {
            var sel = String(p.cruise_port_id) === String(port.cruise_port_id) ? ' selected' : '';
            portOptions += '<option value="' + p.cruise_port_id + '"' + sel + '>' +
                escapeHtml(portLabel(p)) + '</option>';
        });
        var $row = $(
            '<tr>' +
                '<td><input type="number" class="form-control trip-port-day" value="' +
                    (port.cruise_trip_day != null ? port.cruise_trip_day : '') + '"></td>' +
                '<td><input type="date" class="form-control trip-port-date" value="' +
                    (port.cruise_trip_date || '') + '"></td>' +
                '<td><select class="form-control trip-port-id" style="display:inline-block;width:calc(100% - 32px)">' + portOptions + '</select>' +
                '    <button type="button" class="ui-button ui-corner-all trip-port-notes" title="View port notes" ' +
                '            style="display:none;width:28px;padding:2px 0;margin-left:4px;vertical-align:middle">📝</button></td>' +
                '<td class="trip-port-forecast" style="font-size:13px;white-space:nowrap"></td>' +
                '<td><input type="text" class="form-control trip-port-comment" value="' +
                    escapeHtml(port.cruise_trip_comment || '') + '"></td>' +
                '<td><button type="button" class="ui-button ui-widget ui-corner-all trip-port-remove">&times;</button></td>' +
            '</tr>'
        );
        function refreshNotesButton() {
            var pid = $row.find('.trip-port-id').val();
            var p = lookupPort(pid);
            $row.find('.trip-port-notes').toggle(!!(p && p.port_notes && p.port_notes.trim()));
        }
        function refreshForecast() {
            renderRowForecast($row);
        }
        $row.find('.trip-port-id').on('change', function() {
            refreshNotesButton();
            refreshForecast();
        });
        $row.find('.trip-port-date').on('change', refreshForecast);
        $row.find('.trip-port-notes').on('click', function() {
            var pid = $row.find('.trip-port-id').val();
            var p = lookupPort(pid);
            if (p) openPortNotesView(p);
        });
        $row.find('.trip-port-remove').on('click', function() { $row.remove(); });
        $('#trip_ports_table tbody').append($row);
        refreshNotesButton();
        refreshForecast();
    }

    // ---- Per-port weather forecast (Open-Meteo via /data/port_weather) ----
    // One in-flight request per port; results cached in-memory so rows for
    // the same port don't duplicate requests. Server caches for 3 hours.
    var weatherPromises = {};   // port_id -> jQuery promise
    var WEATHER_HORIZON_DAYS = 14;

    function fetchPortWeather(portId) {
        if (!portId) return $.Deferred().reject().promise();
        if (weatherPromises[portId]) return weatherPromises[portId];
        weatherPromises[portId] = $.ajax({
            url: base_url + 'data/port_weather/' + portId,
            method: 'GET', dataType: 'json'
        });
        return weatherPromises[portId];
    }

    function renderRowForecast($row) {
        var $cell = $row.find('.trip-port-forecast');
        $cell.empty();
        var portId = $row.find('.trip-port-id').val();
        var dateStr = $row.find('.trip-port-date').val();
        if (!portId || !dateStr) return;
        var today = new Date(); today.setHours(0,0,0,0);
        var d = new Date(dateStr + 'T00:00:00');
        if (isNaN(d.getTime())) return;
        var diff = Math.round((d - today) / 86400000);
        if (diff < 0 || diff > WEATHER_HORIZON_DAYS) return;
        $cell.html('<span style="color:#999">…</span>');
        fetchPortWeather(portId).done(function(payload) {
            // Make sure the row still has the same port + date we asked for
            if ($row.find('.trip-port-id').val() !== String(portId) ||
                $row.find('.trip-port-date').val() !== dateStr) return;
            var day = (payload.days || []).find(function(x) { return x.date === dateStr; });
            if (!day) {
                $cell.empty();
                return;
            }
            var temp = (day.high_f != null && day.low_f != null)
                ? day.high_f + '/' + day.low_f + '°' : '';
            var precip = day.precip_pct != null ? day.precip_pct + '% precip' : '';
            var title = [day.description, temp, precip].filter(Boolean).join(' · ');
            $cell.attr('title', title)
                 .html((day.emoji || '·') + ' ' + temp);
        }).fail(function() {
            $cell.empty();
        });
    }

    var $dialog_port_notes_view = $('#dialog_port_notes_view').dialog({
        autoOpen: false, modal: true, title: 'Port notes',
        width: Math.min(520, window.innerWidth * 0.9),
        buttons: [
            { text: 'Close', class: 'ui-button ui-widget ui-corner-all', click: function() {
                $dialog_port_notes_view.dialog('close');
            }}
        ]
    });

    function openPortNotesView(port) {
        $('#port_notes_view_label').text(portLabel(port));
        $('#port_notes_view_body').text(port.port_notes || '(no notes)');
        $dialog_port_notes_view.dialog('open');
    }

    $('#trip_ports_add_row').on('click', function() { addItineraryRow(null); });

    function addStaffRow(staff) {
        staff = staff || {};
        var positionOptions = '<option value="">-- select --</option>';
        tripLookups.staff_positions.forEach(function(pos) {
            var sel = String(pos.staff_position_id) === String(staff.staff_position_id) ? ' selected' : '';
            positionOptions += '<option value="' + pos.staff_position_id + '"' + sel + '>' +
                escapeHtml(pos.staff_position) + '</option>';
        });
        var $row = $(
            '<tr>' +
                '<td><input type="text" class="form-control trip-staff-name" value="' +
                    escapeHtml(staff.name || '') + '"></td>' +
                '<td><select class="form-control trip-staff-position">' + positionOptions + '</select></td>' +
                '<td><input type="text" class="form-control trip-staff-location" value="' +
                    escapeHtml(staff.location || '') + '"></td>' +
                '<td><input type="text" class="form-control trip-staff-notes" value="' +
                    escapeHtml(staff.notes || '') + '"></td>' +
                '<td><button type="button" class="ui-button ui-widget ui-corner-all trip-staff-remove">&times;</button></td>' +
            '</tr>'
        );
        $row.find('.trip-staff-remove').on('click', function() { $row.remove(); });
        $('#trip_staff_table tbody').append($row);
    }

    $('#trip_staff_add_row').on('click', function() { addStaffRow(null); });

    // Trip day = (event date - cruise departure date) + 1. Returns '' when
    // either date is missing or the event falls before departure.
    function computeTripDay(eventDateStr) {
        var depStr = $('#trip_detail_departure_date').val();
        if (!eventDateStr || !depStr) return '';
        var ev = new Date(eventDateStr + 'T00:00:00');
        var dep = new Date(depStr + 'T00:00:00');
        if (isNaN(ev.getTime()) || isNaN(dep.getTime())) return '';
        var diff = Math.round((ev - dep) / 86400000) + 1;
        return diff >= 1 ? String(diff) : '';
    }

    function refreshAllEventDayCells() {
        $('#trip_event_table tbody tr').each(function() {
            var date = $(this).find('.trip-event-date').val();
            $(this).find('.trip-event-day').text(computeTripDay(date));
        });
    }

    $('#trip_detail_departure_date').on('change', refreshAllEventDayCells);

    function addEventRow(entry) {
        entry = entry || {};
        var $row = $(
            '<tr>' +
                '<td><input type="date" class="form-control trip-event-date" value="' +
                    escapeHtml(entry.event_date || '') + '"></td>' +
                '<td class="trip-event-day" style="text-align:center;font-weight:600"></td>' +
                '<td><input type="time" class="form-control trip-event-time" value="' +
                    escapeHtml(entry.event_time || '') + '"></td>' +
                '<td><input type="text" class="form-control trip-event-name" value="' +
                    escapeHtml(entry.event_name || '') + '"></td>' +
                '<td><input type="text" class="form-control trip-event-location" value="' +
                    escapeHtml(entry.event_location || '') + '"></td>' +
                '<td><textarea class="form-control trip-event-notes" rows="1">' +
                    escapeHtml(entry.event_notes || '') + '</textarea></td>' +
                '<td><button type="button" class="ui-button ui-widget ui-corner-all trip-event-remove">&times;</button></td>' +
            '</tr>'
        );
        $row.find('.trip-event-day').text(computeTripDay(entry.event_date));
        $row.find('.trip-event-date').on('change', function() {
            $row.find('.trip-event-day').text(computeTripDay($(this).val()));
        });
        $row.find('.trip-event-remove').on('click', function() { $row.remove(); });
        $('#trip_event_table tbody').append($row);
    }

    $('#trip_event_add_row').on('click', function() { addEventRow(null); });

    function getEventRows() {
        var rows = [];
        $('#trip_event_table tbody tr').each(function() {
            var date = $(this).find('.trip-event-date').val();
            var time = $(this).find('.trip-event-time').val();
            var name = $(this).find('.trip-event-name').val().trim();
            var location = $(this).find('.trip-event-location').val().trim();
            var notes = $(this).find('.trip-event-notes').val();
            if (!date && !name && !location && !(notes && notes.trim())) return;
            rows.push({
                event_date: date || null,
                event_time: time || null,
                event_name: name || null,
                event_location: location || null,
                event_notes: notes || null
            });
        });
        return rows;
    }

    function getStaffRows() {
        var rows = [];
        $('#trip_staff_table tbody tr').each(function() {
            var name = $(this).find('.trip-staff-name').val().trim();
            var positionId = parseInt($(this).find('.trip-staff-position').val(), 10) || null;
            var location = $(this).find('.trip-staff-location').val().trim();
            var notes = $(this).find('.trip-staff-notes').val();
            if (!name && !positionId && !location && !notes) return;
            rows.push({
                name: name || null,
                staff_position_id: positionId,
                location: location || null,
                notes: notes || null
            });
        });
        return rows;
    }

    function rebuildStaffPositionDropdowns() {
        $('#trip_staff_table tbody tr').each(function() {
            var $sel = $(this).find('.trip-staff-position');
            var current = $sel.val();
            var html = '<option value="">-- select --</option>';
            tripLookups.staff_positions.forEach(function(pos) {
                var sel = String(pos.staff_position_id) === String(current) ? ' selected' : '';
                html += '<option value="' + pos.staff_position_id + '"' + sel + '>' +
                    escapeHtml(pos.staff_position) + '</option>';
            });
            $sel.html(html);
        });
    }

    function getItineraryRows() {
        var rows = [];
        $('#trip_ports_table tbody tr').each(function() {
            var day = parseInt($(this).find('.trip-port-day').val(), 10);
            var portId = parseInt($(this).find('.trip-port-id').val(), 10);
            if (isNaN(day) || isNaN(portId)) return;
            rows.push({
                cruise_trip_day: day,
                cruise_trip_date: $(this).find('.trip-port-date').val() || null,
                cruise_port_id: portId,
                cruise_trip_comment: $(this).find('.trip-port-comment').val() || null
            });
        });
        return rows;
    }

    function getTripPayload() {
        return {
            cruise_name: $('#trip_detail_cruise_name').val().trim() || null,
            cruise_ship_id: parseInt($('#trip_detail_cruise_ship_id').val(), 10) || null,
            departure_port_id: parseInt($('#trip_detail_departure_port_id').val(), 10) || null,
            arrival_port_id: parseInt($('#trip_detail_arrival_port_id').val(), 10) || null,
            departure_date: $('#trip_detail_departure_date').val() || null,
            arrival_date: $('#trip_detail_arrival_date').val() || null,
            book_date: $('#trip_detail_book_date').val() || null,
            cruise_length_days: parseInt($('#trip_detail_cruise_length_days').val(), 10) || null,
            deck_number: parseInt($('#trip_detail_deck_number').val(), 10) || null,
            room_number: parseInt($('#trip_detail_room_number').val(), 10) || null,
            suite_yn: $('#trip_detail_suite_yn').is(':checked') ? '1' : '0',
            agent_yn: $('#trip_detail_agent_yn').is(':checked') ? '1' : '0',
            agent_name: $('#trip_detail_agent_name').val().trim() || null,
            cat_sitter: $('#trip_detail_cat_sitter').val().trim() || null,
            trip_notes: $('#trip_detail_trip_notes').val() || null,
            trip_haiku: $('#trip_detail_trip_haiku').val().trim() || null,
            apple_music_url: $('#trip_detail_apple_music_url').val().trim() || null,
            trip_cost: $('#trip_detail_trip_cost').val().trim() || null,
            amount_paid: $('#trip_detail_amount_paid').val().trim() || null,
            amount_due_date: $('#trip_detail_amount_due_date').val() || null,
            club_points: parseInt($('#trip_detail_club_points').val(), 10),
            airfare_cost: $('#trip_detail_airfare_cost').val().trim() || null,
            hotel_cost: $('#trip_detail_hotel_cost').val().trim() || null,
            cat_sitter_cost: $('#trip_detail_cat_sitter_cost').val().trim() || null,
            need_airfare_yn: $('#trip_detail_need_airfare_yn').is(':checked') ? '1' : '0',
            airfare_purchased_yn: $('#trip_detail_airfare_purchased_yn').is(':checked') ? '1' : '0',
            need_hotel_yn: $('#trip_detail_need_hotel_yn').is(':checked') ? '1' : '0',
            hotel_booked_yn: $('#trip_detail_hotel_booked_yn').is(':checked') ? '1' : '0'
        };
    }

    function saveTrip() {
        var payload = getTripPayload();
        if (!payload.cruise_ship_id) {
            alert('Please select a cruise ship.');
            return $.Deferred().reject().promise();
        }
        if (!payload.departure_date) {
            alert('Please enter a departure date.');
            return $.Deferred().reject().promise();
        }
        var existingId = $('#trip_detail_cruise_trip_id').val();
        var url = existingId ? base_url + 'data/cruise_trip/' + existingId : base_url + 'data/cruise_trip';
        var method = existingId ? 'PUT' : 'POST';
        return $.ajax({
            url: url, method: method,
            contentType: 'application/json',
            data: JSON.stringify(payload)
        }).then(function(resp) {
            var newId = resp.cruise_trip_id;
            return $.ajax({
                url: base_url + 'data/cruise_trip/' + newId + '/ports',
                method: 'PUT',
                contentType: 'application/json',
                data: JSON.stringify({ ports: getItineraryRows() })
            }).then(function() {
                return $.ajax({
                    url: base_url + 'data/cruise_trip/' + newId + '/staff',
                    method: 'PUT',
                    contentType: 'application/json',
                    data: JSON.stringify({ staff: getStaffRows() })
                });
            }).then(function() {
                return $.ajax({
                    url: base_url + 'data/cruise_trip/' + newId + '/events',
                    method: 'PUT',
                    contentType: 'application/json',
                    data: JSON.stringify({ events: getEventRows() })
                });
            }).then(function() { return newId; });
        });
    }

    function openTripDialog(mode, tripId) {
        // Reset, but if the music tab is already the active one (carried
        // over from a previous open), count it as visited so close-time
        // parking still happens without requiring a re-click.
        musicTabVisited = isMusicTabActive();
        loadTripLookups().done(function() {
            if (mode === 'edit' && tripId) {
                $('#trip_detail_tabs').tabs('option', 'disabled', false);
                $.getJSON(base_url + 'data/cruise_trip/' + tripId + '/full', function(trip) {
                    setTripFields(trip);
                    $dialog_trip_detail.dialog('option', 'title', 'Edit cruise trip');
                    $dialog_trip_detail.dialog('open');
                    loadTripPhotos(tripId, trip);
                }).fail(function() { alert('Could not load trip ' + tripId); });
            } else {
                setTripFields({});
                // disable photos tab (index 5) while trip has no id yet
                $('#trip_detail_tabs').tabs('option', 'disabled', [5]);
                tripPhotosState = { tripId: null, label: '', dateRange: '',
                                    photos: [], page: 0 };
                $('#trip_photos_grid').empty();
                $('#trip_photos_pager').hide();
                $('#trip_photos_status').text('Save the trip first to enable photos.');
                $dialog_trip_detail.dialog('option', 'title', 'Add cruise trip');
                $dialog_trip_detail.dialog('open');
            }
        });
    }

    // ---- Music tab (Apple Music embed) ----
    function toAppleEmbedUrl(raw) {
        if (!raw) return '';
        var s = raw.trim();
        if (!s) return '';
        // accept full URLs only; bail on anything that doesn't look like an Apple Music link
        if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
        try {
            var u = new URL(s);
            if (!/(^|\.)music\.apple\.com$/i.test(u.hostname) &&
                !/(^|\.)embed\.music\.apple\.com$/i.test(u.hostname)) return '';
            u.hostname = 'embed.music.apple.com';
            return u.toString();
        } catch (e) {
            return '';
        }
    }

    function renderAppleMusicEmbed(rawUrl, tripId) {
        // If the mini player already holds this trip's iframe, reclaim it
        // (preserves playback) instead of building a fresh one.
        if (tripId && reclaimMiniPlayerForTrip(tripId)) return;
        var $wrap = $('#trip_music_embed_wrap').empty();
        var embedUrl = toAppleEmbedUrl(rawUrl);
        if (!embedUrl) return;
        // About to create a fresh iframe in the dialog. If the mini player
        // is playing a *different* trip's music, stop it now — otherwise
        // we'd have two iframes playing in parallel.
        var $miniIframe = $('#mini_music_embed iframe');
        if ($miniIframe.length && (!tripId ||
            String($miniIframe.attr('data-trip-id')) !== String(tripId))) {
            $('#mini_music_embed').empty();
            $('#mini_music_player').hide();
        }
        var $iframe = $('<iframe>')
            .attr({
                src: embedUrl,
                allow: 'autoplay *; encrypted-media *; fullscreen *; clipboard-write',
                frameborder: '0',
                sandbox: 'allow-forms allow-popups allow-same-origin allow-scripts ' +
                         'allow-storage-access-by-user-activation allow-top-navigation-by-user-activation'
            });
        if (tripId) $iframe.attr('data-trip-id', tripId);
        $wrap.append($iframe);
    }

    // Move the trip dialog's iframe (if any) into the floating mini player so
    // playback survives the dialog closing. Detach (not remove/append) keeps
    // the iframe element identical, so audio continues without a re-load.
    function isMusicTabActive() {
        var $tabs = $('#trip_detail_tabs');
        if (!$tabs.length || !$tabs.data('uiTabs')) return false;
        var idx = $tabs.tabs('option', 'active');
        if (idx == null || idx < 0) return false;
        return $tabs.find('> div').eq(idx).attr('id') === 'trip_detail_tab_music';
    }

    function parkMusicInMiniPlayer() {
        // Only park if the user actually engaged with the music tab this
        // session, OR the music tab is the currently-active one at close
        // time (jQuery UI tabs remember the last tab across opens, so the
        // 'activate' event may not fire even when the user is on it).
        if (!musicTabVisited && !isMusicTabActive()) return;
        var $iframe = $('#trip_music_embed_wrap iframe');
        if ($iframe.length === 0) return;
        var tripId = $('#trip_detail_cruise_trip_id').val();
        var name = $('#trip_detail_cruise_name').val();
        if (!name) name = tripId ? ('Trip #' + tripId) : 'Now playing';
        $('#mini_music_label').text(name);
        $('#mini_music_embed').empty().append($iframe.detach());
        if (tripId) $iframe.attr('data-trip-id', tripId);
        $('#mini_music_player').show();
    }

    // If the mini player holds an iframe for the given trip, move it back
    // into the dialog wrap and hide the mini player. Returns true if the
    // reclamation happened so callers can skip a fresh embed build.
    function reclaimMiniPlayerForTrip(tripId) {
        if (!tripId) return false;
        var $iframe = $('#mini_music_embed iframe');
        if ($iframe.length === 0) return false;
        if (String($iframe.attr('data-trip-id')) !== String(tripId)) return false;
        $('#trip_music_embed_wrap').empty().append($iframe.detach());
        $('#mini_music_player').hide();
        // Reclaimed iframe was already playing — make sure dialog close
        // re-parks it instead of letting it get garbage-collected.
        musicTabVisited = true;
        return true;
    }

    $('#mini_music_close').on('click', function() {
        $('#mini_music_embed').empty();
        $('#mini_music_player').hide();
    });

    $dialog_trip_detail.on('dialogclose', parkMusicInMiniPlayer);

    var musicEmbedDebounce = null;
    $('#trip_detail_apple_music_url').on('input change', function() {
        var val = $(this).val();
        var tripId = $('#trip_detail_cruise_trip_id').val();
        clearTimeout(musicEmbedDebounce);
        musicEmbedDebounce = setTimeout(function() {
            renderAppleMusicEmbed(val, tripId);
        }, 300);
    });

    // ---- Photos tab ----
    var TRIP_PHOTOS_PER_PAGE = 10;
    var tripPhotosState = {
        tripId: null, label: '', dateRange: '', photos: [], page: 0
    };

    function tripPhotoLabel(trip) {
        if (trip && trip.cruise_name) return trip.cruise_name;
        if (trip && trip.cruise_ship_id) {
            var ship = (tripLookups.cruise_ships || []).find(function(s) {
                return String(s.cruise_ship_id) === String(trip.cruise_ship_id);
            });
            if (ship) return ship.ship_name;
        }
        return 'Cruise';
    }

    function tripPhotoDateRange(trip) {
        var dep = fmtTripDate(trip && trip.departure_date);
        var arr = fmtTripDate(trip && trip.arrival_date);
        if (dep && arr) return dep + ' – ' + arr;
        return dep || arr || '';
    }

    function loadTripPhotos(tripId, trip) {
        tripPhotosState = {
            tripId: tripId,
            label: tripPhotoLabel(trip),
            dateRange: tripPhotoDateRange(trip),
            photos: [],
            page: 0
        };
        $('#trip_photos_status').text('');
        $('#trip_photos_grid').empty();
        $('#trip_photos_pager').hide();
        return $.getJSON(base_url + 'data/cruise_trip/' + tripId + '/photos').done(function(photos) {
            tripPhotosState.photos = photos || [];
            renderTripPhotosPage();
        });
    }

    function renderTripPhotosPage() {
        var state = tripPhotosState;
        var total = state.photos.length;
        var pages = Math.max(1, Math.ceil(total / TRIP_PHOTOS_PER_PAGE));
        if (state.page >= pages) state.page = pages - 1;
        if (state.page < 0) state.page = 0;
        var start = state.page * TRIP_PHOTOS_PER_PAGE;
        var slice = state.photos.slice(start, start + TRIP_PHOTOS_PER_PAGE);
        var $grid = $('#trip_photos_grid').empty();
        slice.forEach(function(p, i) {
            $grid.append(buildPhotoTile(p, start + i));
        });
        var $pager = $('#trip_photos_pager');
        if (total <= TRIP_PHOTOS_PER_PAGE) { $pager.hide(); return; }
        $pager.show();
        $pager.find('.photos-pager-info').text(
            'Page ' + (state.page + 1) + ' of ' + pages
            + '  ·  ' + total + ' photos');
        $pager.find('.photos-pager-prev').prop('disabled', state.page === 0);
        $pager.find('.photos-pager-next').prop('disabled', state.page >= pages - 1);
    }

    function tripPhotosToLightboxList() {
        var state = tripPhotosState;
        var n = state.photos.length;
        return state.photos.map(function(p, i) {
            return {
                fullSrc: '/static/' + p.file_path,
                caption: p.caption || '',
                dialogTitle: (state.label || 'Cruise')
                    + (state.dateRange ? ' · ' + state.dateRange : '')
                    + ' · Photo ' + (i + 1) + ' of ' + n
            };
        });
    }

    function buildPhotoTile(p, absoluteIndex) {
        var src = '/static/' + p.file_path;
        var $tile = $(
            '<div class="trip-photo-tile" data-photo-id="' + p.cruise_trip_photo_id + '">' +
                '<img src="' + escapeHtml(src) + '" alt="' + escapeHtml(p.original_filename || '') +
                    '" title="' + escapeHtml(p.original_filename || '') + '">' +
                '<input type="text" class="form-control photo-caption" placeholder="caption" value="' +
                    escapeHtml(p.caption || '') + '">' +
                '<div class="photo-actions">' +
                    '<button type="button" class="ui-button ui-widget ui-corner-all photo-delete" title="Delete">&times;</button>' +
                '</div>' +
            '</div>'
        );
        $tile.find('img').on('click', function() {
            openLightbox(tripPhotosToLightboxList(), absoluteIndex);
        });
        $tile.find('.photo-caption').on('blur', function() {
            var newCap = $(this).val();
            $.ajax({
                url: base_url + 'data/cruise_trip/photo/' + p.cruise_trip_photo_id,
                method: 'PUT',
                contentType: 'application/json',
                data: JSON.stringify({ caption: newCap })
            });
            // Keep cached state in sync so the lightbox reflects edits
            // without requiring a reload.
            p.caption = newCap;
        });
        $tile.find('.photo-delete').on('click', function() {
            if (!confirm('Delete this photo?')) return;
            $.ajax({
                url: base_url + 'data/cruise_trip/photo/' + p.cruise_trip_photo_id,
                method: 'DELETE'
            }).done(function() {
                tripPhotosState.photos = tripPhotosState.photos.filter(function(pp) {
                    return pp.cruise_trip_photo_id !== p.cruise_trip_photo_id;
                });
                renderTripPhotosPage();
            });
        });
        return $tile;
    }

    $('#trip_photos_pager').on('click', '.photos-pager-prev', function() {
        if (tripPhotosState.page > 0) { tripPhotosState.page--; renderTripPhotosPage(); }
    });
    $('#trip_photos_pager').on('click', '.photos-pager-next', function() {
        var pages = Math.ceil(tripPhotosState.photos.length / TRIP_PHOTOS_PER_PAGE);
        if (tripPhotosState.page < pages - 1) { tripPhotosState.page++; renderTripPhotosPage(); }
    });

    $('#trip_photos_upload').on('click', function() {
        var tripId = $('#trip_detail_cruise_trip_id').val();
        if (!tripId) { alert('Save the trip first.'); return; }
        $('#trip_photos_input').val('');
        $('#trip_photos_input').click();
    });

    $('#trip_photos_input').on('change', function() {
        var tripId = $('#trip_detail_cruise_trip_id').val();
        if (!tripId || !this.files || !this.files.length) return;
        var fd = new FormData();
        for (var i = 0; i < this.files.length; i++) fd.append('photos', this.files[i]);
        $('#trip_photos_status').text('uploading...');
        $.ajax({
            url: base_url + 'data/cruise_trip/' + tripId + '/photos',
            method: 'POST',
            data: fd,
            processData: false,
            contentType: false
        }).done(function(resp) {
            (resp.inserted || []).forEach(function(p) {
                tripPhotosState.photos.push(p);
            });
            // Jump to the last page so the just-uploaded photos are visible.
            var totalPages = Math.max(1, Math.ceil(
                tripPhotosState.photos.length / TRIP_PHOTOS_PER_PAGE));
            tripPhotosState.page = totalPages - 1;
            renderTripPhotosPage();
            var msg = 'uploaded ' + (resp.inserted || []).length + ' photo(s)';
            if (resp.skipped && resp.skipped.length) {
                msg += ' — skipped: ' + resp.skipped.map(function(s) {
                    return s.filename + ' (' + s.reason + ')';
                }).join(', ');
            }
            $('#trip_photos_status').text(msg);
        }).fail(function(xhr) {
            $('#trip_photos_status').text('upload failed' +
                (xhr && xhr.responseText ? ': ' + xhr.responseText : ''));
        });
    });

    // ---- Staff position sub-dialog ----
    var staffPositionDialogOnSaved = null;

    var $dialog_staff_position_detail = $('#dialog_staff_position_detail').dialog({
        autoOpen: false, modal: true, title: 'Add staff position',
        width: Math.min(480, window_width * 0.7),
        close: function() { staffPositionDialogOnSaved = null; },
        buttons: [
            { text: 'Save', class: 'ui-button ui-widget ui-corner-all', click: function() {
                var name = $('#staff_position_detail_name').val().trim();
                if (!name) { alert('Position name is required.'); return; }
                $.ajax({
                    url: base_url + 'data/staff_position', method: 'POST',
                    contentType: 'application/json',
                    data: JSON.stringify({ staff_position: name })
                }).done(function(resp) {
                    var cb = staffPositionDialogOnSaved;
                    $dialog_staff_position_detail.dialog('close');
                    if (cb) cb(resp.staff_position_id);
                }).fail(function(xhr) {
                    if (xhr && xhr.responseText) alert('Save failed: ' + xhr.responseText);
                });
            }},
            { text: 'Cancel', class: 'ui-button ui-widget ui-corner-all', click: function() {
                $dialog_staff_position_detail.dialog('close');
            }}
        ]
    });

    function openStaffPositionDialog(onSaved) {
        staffPositionDialogOnSaved = onSaved || null;
        $('#staff_position_detail_name').val('');
        $dialog_staff_position_detail.dialog('open');
    }

    $('#trip_staff_add_position').on('click', function() {
        openStaffPositionDialog(function() {
            refreshLookup('staff_positions').done(function() {
                rebuildStaffPositionDropdowns();
            });
        });
    });

    // ---- Sub-dialogs: company, cruise line, cruise ship ----
    var companyDialogOnSaved = null;
    var lineDialogOnSaved = null;
    var shipDialogOnSaved = null;

    var $dialog_company_detail = $('#dialog_company_detail').dialog({
        autoOpen: false, modal: true, title: 'Add company',
        width: Math.min(640, window_width * 0.8),
        close: function() { companyDialogOnSaved = null; },
        buttons: [
            { text: 'Save', class: 'ui-button ui-widget ui-corner-all', click: function() {
                var name = $('#company_detail_company_name').val().trim();
                if (!name) { alert('Company name is required.'); return; }
                $.ajax({
                    url: base_url + 'data/company', method: 'POST',
                    contentType: 'application/json',
                    data: JSON.stringify({
                        company_name: name,
                        company_abbr: $('#company_detail_company_abbr').val().trim() || null,
                        company_url: $('#company_detail_company_url').val().trim() || null
                    })
                }).done(function(resp) {
                    var cb = companyDialogOnSaved;
                    $dialog_company_detail.dialog('close');
                    if (cb) cb(resp.company_id);
                }).fail(function(xhr) {
                    if (xhr && xhr.responseText) alert('Save failed: ' + xhr.responseText);
                });
            }},
            { text: 'Cancel', class: 'ui-button ui-widget ui-corner-all', click: function() {
                $dialog_company_detail.dialog('close');
            }}
        ]
    });

    function openCompanyDialog(onSaved) {
        companyDialogOnSaved = onSaved || null;
        $('#company_detail_company_name, #company_detail_company_abbr, #company_detail_company_url').val('');
        $dialog_company_detail.dialog('open');
    }

    var $dialog_line_detail = $('#dialog_line_detail').dialog({
        autoOpen: false, modal: true, title: 'Add cruise line',
        width: Math.min(720, window_width * 0.85),
        close: function() { lineDialogOnSaved = null; },
        buttons: [
            { text: 'Save', class: 'ui-button ui-widget ui-corner-all', click: function() {
                var name = $('#line_detail_cruise_line').val().trim();
                if (!name) { alert('Cruise line name is required.'); return; }
                $.ajax({
                    url: base_url + 'data/cruise_line', method: 'POST',
                    contentType: 'application/json',
                    data: JSON.stringify({
                        cruise_line: name,
                        cruise_line_abbr: $('#line_detail_cruise_line_abbr').val().trim() || null,
                        cruise_line_url: $('#line_detail_cruise_line_url').val().trim() || null,
                        cruise_line_reward_program: $('#line_detail_cruise_line_reward_program').val().trim() || null,
                        company_id: parseInt($('#line_detail_company_id').val(), 10) || null
                    })
                }).done(function(resp) {
                    var cb = lineDialogOnSaved;
                    $dialog_line_detail.dialog('close');
                    if (cb) cb(resp.cruise_line_id);
                }).fail(function(xhr) {
                    if (xhr && xhr.responseText) alert('Save failed: ' + xhr.responseText);
                });
            }},
            { text: 'Cancel', class: 'ui-button ui-widget ui-corner-all', click: function() {
                $dialog_line_detail.dialog('close');
            }}
        ]
    });

    function openLineDialog(onSaved) {
        lineDialogOnSaved = onSaved || null;
        $('#line_detail_cruise_line, #line_detail_cruise_line_abbr, ' +
          '#line_detail_cruise_line_url, #line_detail_cruise_line_reward_program').val('');
        fillSelect($('#line_detail_company_id'), tripLookups.companies, 'company_id',
            function(c) { return c.company_name; }, null);
        $dialog_line_detail.dialog('open');
    }

    $('#line_detail_add_company').on('click', function() {
        openCompanyDialog(function(newId) {
            refreshLookup('companies').done(function() {
                fillSelect($('#line_detail_company_id'), tripLookups.companies, 'company_id',
                    function(c) { return c.company_name; }, newId);
            });
        });
    });

    var $dialog_ship_detail = $('#dialog_ship_detail').dialog({
        autoOpen: false, modal: true, title: 'Add cruise ship',
        width: Math.min(800, window_width * 0.85),
        close: function() { shipDialogOnSaved = null; },
        buttons: [
            { text: 'Save', class: 'ui-button ui-widget ui-corner-all', click: function() {
                var name = $('#ship_detail_ship_name').val().trim();
                var lineId = parseInt($('#ship_detail_cruise_line_id').val(), 10);
                if (!name) { alert('Ship name is required.'); return; }
                if (!lineId) { alert('Cruise line is required.'); return; }
                $.ajax({
                    url: base_url + 'data/cruise_ship', method: 'POST',
                    contentType: 'application/json',
                    data: JSON.stringify({
                        ship_name: name,
                        cruise_line_id: lineId,
                        year_built: parseInt($('#ship_detail_year_built').val(), 10) || null,
                        occupancy: parseInt($('#ship_detail_occupancy').val(), 10) || null,
                        ship_class: $('#ship_detail_ship_class').val().trim() || null,
                        casino_deck_number: parseInt($('#ship_detail_casino_deck_number').val(), 10) || null,
                        lounge_deck_number: parseInt($('#ship_detail_lounge_deck_number').val(), 10) || null,
                        restaurant_deck_number: parseInt($('#ship_detail_restaurant_deck_number').val(), 10) || null,
                        retreat_deck_number: parseInt($('#ship_detail_retreat_deck_number').val(), 10) || null
                    })
                }).done(function(resp) {
                    var cb = shipDialogOnSaved;
                    $dialog_ship_detail.dialog('close');
                    if (cb) cb(resp.cruise_ship_id, lineId);
                }).fail(function(xhr) {
                    if (xhr && xhr.responseText) alert('Save failed: ' + xhr.responseText);
                });
            }},
            { text: 'Cancel', class: 'ui-button ui-widget ui-corner-all', click: function() {
                $dialog_ship_detail.dialog('close');
            }}
        ]
    });

    function openShipDialog(prefillLineId, onSaved) {
        shipDialogOnSaved = onSaved || null;
        $('#ship_detail_ship_name, #ship_detail_year_built, #ship_detail_occupancy, ' +
          '#ship_detail_ship_class, #ship_detail_casino_deck_number, ' +
          '#ship_detail_lounge_deck_number, #ship_detail_restaurant_deck_number, ' +
          '#ship_detail_retreat_deck_number').val('');
        fillSelect($('#ship_detail_cruise_line_id'), tripLookups.cruise_lines, 'cruise_line_id',
            function(l) { return l.cruise_line; }, prefillLineId);
        $dialog_ship_detail.dialog('open');
    }

    // ---- Wire ➕ buttons in trip dialog ----
    $('#trip_detail_add_line').on('click', function() {
        openLineDialog(function(newId) {
            refreshLookup('cruise_lines').done(function() {
                fillSelect($('#trip_detail_cruise_line_id'), tripLookups.cruise_lines, 'cruise_line_id',
                    function(l) { return l.cruise_line; }, newId);
                refreshShipsDropdown(null);
            });
        });
    });

    $('#trip_detail_add_ship').on('click', function() {
        var currentLineId = $('#trip_detail_cruise_line_id').val();
        openShipDialog(currentLineId, function(newShipId, newLineId) {
            refreshLookup('cruise_ships').done(function() {
                if (newLineId) $('#trip_detail_cruise_line_id').val(newLineId);
                refreshShipsDropdown(newShipId);
            });
        });
    });

    $('.trip_detail_add_port').on('click', function() {
        var targetSelectId = $(this).data('target');
        openPortDialog('add', null, function(newPortId) {
            refreshLookup('ports').done(function() {
                rebuildPortSelects();
                if (targetSelectId && newPortId) $('#' + targetSelectId).val(newPortId);
            });
        });
    });

    $('#trip_ports_add_new_port').on('click', function() {
        openPortDialog('add', null, function(newPortId) {
            refreshLookup('ports').done(function() {
                rebuildPortSelects();
                if (newPortId) addItineraryRow({ cruise_port_id: newPortId });
            });
        });
    });

    // ---- Port edit dialog ----
    if (typeof mapboxgl !== 'undefined') {
        mapboxgl.accessToken = mapbox_key;
    }
    var portEditMap = null;
    var portEditMarker = null;
    var portDialogMode = 'add';     // 'add' | 'edit' | 'review'
    var portReviewQueue = [];
    var portReviewIndex = 0;
    var portDialogOnSaved = null;

    var $dialog_port_detail = $('#dialog_port_detail').dialog({
        autoOpen: false,
        modal: true,
        title: 'Port',
        width: Math.min(900, window_width * 0.9),
        height: Math.min(640, window_height * 0.9),
        close: function() { portDialogOnSaved = null; }
    });

    function ensurePortMap() {
        if (portEditMap || typeof mapboxgl === 'undefined') return;
        portEditMap = new mapboxgl.Map({
            container: 'port_detail_map',
            style: 'mapbox://styles/mapbox/streets-v12',
            center: [-80, 25],
            zoom: 3
        });
        portEditMarker = new mapboxgl.Marker({ draggable: true, color: '#BD9B60' })
            .setLngLat([-80, 25])
            .addTo(portEditMap);
        portEditMarker.on('dragend', function() {
            var ll = portEditMarker.getLngLat();
            $('#port_detail_latitude').val(ll.lat.toFixed(6));
            $('#port_detail_longitude').val(ll.lng.toFixed(6));
        });
        portEditMap.on('click', function(e) {
            portEditMarker.setLngLat(e.lngLat);
            $('#port_detail_latitude').val(e.lngLat.lat.toFixed(6));
            $('#port_detail_longitude').val(e.lngLat.lng.toFixed(6));
        });
    }

    function setPortDialogFields(port) {
        port = port || {};
        $('#port_detail_cruise_port_id').val(port.cruise_port_id != null ? port.cruise_port_id : '');
        $('#port_detail_cruise_port').val(port.cruise_port || '');
        $('#port_detail_city').val(port.city || '');
        $('#port_detail_state').val(port.state || '');
        $('#port_detail_latitude').val(port.latitude != null ? port.latitude : '');
        $('#port_detail_longitude').val(port.longitude != null ? port.longitude : '');
        $('#port_detail_nearest_airport').val(port.nearest_airport || '');
        $('#port_detail_port_notes').val(port.port_notes || '');
        $('#port_detail_status').text('');
        var lat = parseFloat(port.latitude);
        var lon = parseFloat(port.longitude);
        if (portEditMap && !isNaN(lat) && !isNaN(lon)) {
            portEditMarker.setLngLat([lon, lat]);
            portEditMap.flyTo({ center: [lon, lat], zoom: 11, duration: 500 });
        } else if (portEditMap) {
            portEditMap.flyTo({ center: [-80, 25], zoom: 3, duration: 0 });
        }
    }

    function setDialogTitle() {
        if (portDialogMode === 'add') {
            $dialog_port_detail.dialog('option', 'title', 'Add port');
        } else if (portDialogMode === 'review') {
            $dialog_port_detail.dialog('option', 'title',
                'Review ports (' + (portReviewIndex + 1) + ' of ' + portReviewQueue.length + ')');
        } else {
            $dialog_port_detail.dialog('option', 'title', 'Edit port');
        }
    }

    function refreshPortViews() {
        $table_port_list.ajax.reload(null, false);
    }

    function savePortDialog() {
        var payload = {
            cruise_port: $('#port_detail_cruise_port').val().trim(),
            city: $('#port_detail_city').val().trim(),
            state: $('#port_detail_state').val().trim(),
            latitude: parseFloat($('#port_detail_latitude').val()),
            longitude: parseFloat($('#port_detail_longitude').val()),
            nearest_airport: $('#port_detail_nearest_airport').val().trim().toUpperCase() || null,
            port_notes: $('#port_detail_port_notes').val()
        };
        if (!payload.cruise_port || !payload.city || !payload.state ||
            isNaN(payload.latitude) || isNaN(payload.longitude)) {
            $('#port_detail_status').text('please fill all fields');
            return $.Deferred().reject().promise();
        }
        var id = $('#port_detail_cruise_port_id').val();
        var url = id ? base_url + 'data/port/' + id : base_url + 'data/port';
        var method = id ? 'PUT' : 'POST';
        return $.ajax({
            url: url,
            method: method,
            contentType: 'application/json',
            data: JSON.stringify(payload)
        }).done(function(resp) {
            $('#port_detail_status').text('saved');
            // update local review record so navigating back shows the new values
            if (portDialogMode === 'review' && portReviewQueue[portReviewIndex]) {
                Object.assign(portReviewQueue[portReviewIndex], payload);
            }
            refreshPortViews();
            if (portDialogOnSaved) {
                var newId = (resp && resp.cruise_port_id) ||
                            parseInt($('#port_detail_cruise_port_id').val(), 10);
                portDialogOnSaved(newId);
            }
        }).fail(function() {
            $('#port_detail_status').text('save failed');
        });
    }

    function reviewStep(delta) {
        var next = portReviewIndex + delta;
        if (next < 0 || next >= portReviewQueue.length) return;
        portReviewIndex = next;
        setPortDialogFields(portReviewQueue[portReviewIndex]);
        setDialogTitle();
    }

    function applyDialogButtons() {
        if (portDialogMode === 'review') {
            $dialog_port_detail.dialog('option', 'buttons', [
                { text: 'Prev', class: 'ui-button ui-widget ui-corner-all',
                    click: function() { reviewStep(-1); } },
                { text: 'Save', class: 'ui-button ui-widget ui-corner-all',
                    click: function() { savePortDialog(); } },
                { text: 'Save & Next', class: 'ui-button ui-widget ui-corner-all',
                    click: function() { savePortDialog().done(function() { reviewStep(1); }); } },
                { text: 'Skip', class: 'ui-button ui-widget ui-corner-all',
                    click: function() { reviewStep(1); } },
                { text: 'Search for Cruises', class: 'ui-button ui-widget ui-corner-all',
                    click: function() { openCruiseSearch(); } },
                { text: 'Done', class: 'ui-button ui-widget ui-corner-all',
                    click: function() { $dialog_port_detail.dialog('close'); } }
            ]);
        } else {
            $dialog_port_detail.dialog('option', 'buttons', [
                { text: 'Save', class: 'ui-button ui-widget ui-corner-all',
                    click: function() {
                        savePortDialog().done(function() { $dialog_port_detail.dialog('close'); });
                    } },
                { text: 'Search for Cruises', class: 'ui-button ui-widget ui-corner-all',
                    click: function() { openCruiseSearch(); } },
                { text: 'Cancel', class: 'ui-button ui-widget ui-corner-all',
                    click: function() { $dialog_port_detail.dialog('close'); } }
            ]);
        }
    }

    function openPortDialog(mode, port, onSaved) {
        portDialogMode = mode;
        portDialogOnSaved = onSaved || null;
        applyDialogButtons();
        setDialogTitle();
        $dialog_port_detail.dialog('open');
        // map needs to be created and resized after the dialog is visible
        setTimeout(function() {
            ensurePortMap();
            setPortDialogFields(port || {});
            if (portEditMap) portEditMap.resize();
        }, 50);
    }

    $('#port_detail_geocode').on('click', function() {
        var portName = $('#port_detail_cruise_port').val().trim();
        var city = $('#port_detail_city').val().trim();
        var state = $('#port_detail_state').val().trim();
        var query = [portName, city, state].filter(Boolean).join(', ');
        if (!query) {
            $('#port_detail_status').text('enter a port/city to look up');
            return;
        }
        $('#port_detail_status').text('searching...');
        var url = 'https://api.mapbox.com/geocoding/v5/mapbox.places/' +
                  encodeURIComponent(query) +
                  '.json?limit=1&access_token=' + encodeURIComponent(mapbox_key);
        fetch(url).then(function(r) { return r.json(); }).then(function(d) {
            if (d.features && d.features.length) {
                var c = d.features[0].center; // [lon, lat]
                $('#port_detail_longitude').val(c[0].toFixed(6));
                $('#port_detail_latitude').val(c[1].toFixed(6));
                if (portEditMap) {
                    portEditMarker.setLngLat(c);
                    portEditMap.flyTo({ center: c, zoom: 12, duration: 600 });
                }
                $('#port_detail_status').text('found: ' + d.features[0].place_name);
            } else {
                $('#port_detail_status').text('no result');
            }
        }).catch(function() {
            $('#port_detail_status').text('lookup failed');
        });
    });

    // ---- Cruise search dialog ----
    var $dialog_port_search = $('#dialog_port_search').dialog({
        autoOpen: false,
        modal: true,
        title: 'Search for cruises',
        width: Math.min(720, window_width * 0.9)
    });

    function buildCruiseSearchQuery() {
        var portName = $('#port_search_port').val().trim();
        var line = $('#port_search_cruise_line').val().trim();
        var nights = $('#port_search_length').val().trim();
        var dateFrom = $('#port_search_date_from').val();
        var dateTo = $('#port_search_date_to').val();
        var keyword = $('#port_search_keyword').val().trim();

        var parts = [];
        if (portName) parts.push('"' + portName + '"');
        parts.push('cruise');
        if (line) parts.push(line);
        if (nights) parts.push(nights + ' night');

        // date range — prefer month+year if same month, otherwise year range
        if (dateFrom && dateTo) {
            if (dateFrom.slice(0, 7) === dateTo.slice(0, 7)) {
                var d = new Date(dateFrom + 'T00:00:00');
                parts.push(d.toLocaleString('en-US', { month: 'long' }) + ' ' + dateFrom.slice(0, 4));
            } else if (dateFrom.slice(0, 4) === dateTo.slice(0, 4)) {
                parts.push(dateFrom.slice(0, 4));
            } else {
                parts.push(dateFrom.slice(0, 4) + '..' + dateTo.slice(0, 4));
            }
        } else if (dateFrom) {
            parts.push(dateFrom.slice(0, 4));
        } else if (dateTo) {
            parts.push(dateTo.slice(0, 4));
        }
        if (keyword) parts.push(keyword);
        return parts.join(' ');
    }

    function updateSearchPreview() {
        $('#port_search_preview').val(buildCruiseSearchQuery());
    }

    $('#dialog_port_search input').on('input change', updateSearchPreview);

    function openSearch(provider) {
        var q = buildCruiseSearchQuery();
        var siteScoped = q;
        if (provider === 'cruisecritic') siteScoped = 'site:cruisecritic.com ' + q;
        else if (provider === 'vacationstogo') siteScoped = 'site:vacationstogo.com ' + q;
        var url = 'https://www.google.com/search?q=' + encodeURIComponent(siteScoped);
        window.open(url, '_blank', 'noopener');
    }

    $dialog_port_search.dialog('option', 'buttons', [
        { text: 'Google', class: 'ui-button ui-widget ui-corner-all',
            click: function() { openSearch('google'); } },
        { text: 'Cruise Critic', class: 'ui-button ui-widget ui-corner-all',
            click: function() { openSearch('cruisecritic'); } },
        { text: 'Vacations To Go', class: 'ui-button ui-widget ui-corner-all',
            click: function() { openSearch('vacationstogo'); } },
        { text: 'Close', class: 'ui-button ui-widget ui-corner-all',
            click: function() { $dialog_port_search.dialog('close'); } }
    ]);

    function openCruiseSearch() {
        var portName = $('#port_detail_cruise_port').val().trim();
        var city = $('#port_detail_city').val().trim();
        $('#port_search_port').val(portName || city);
        $('#port_search_cruise_line').val('');
        $('#port_search_length').val('');
        $('#port_search_date_from').val('');
        $('#port_search_date_to').val('');
        $('#port_search_keyword').val('');
        updateSearchPreview();
        $dialog_port_search.dialog('open');
    }

    // custom DataTables buttons used by the tables further below
    $.fn.dataTable.ext.buttons.add_port = {
        text: 'Add port',
        action: function() { openPortDialog('add', null); }
    };
    $.fn.dataTable.ext.buttons.review_ports = {
        text: 'Review all ports',
        action: function() {
            $.getJSON(base_url + 'data/port_list_table', function(resp) {
                var cols = resp.columns;
                var idx = {
                    cruise_port: cols.indexOf('cruise_port'),
                    city: cols.indexOf('city'),
                    state: cols.indexOf('state'),
                    latitude: cols.indexOf('latitude'),
                    longitude: cols.indexOf('longitude'),
                    cruise_port_id: cols.indexOf('cruise_port_id')
                };
                portReviewQueue = resp.data.map(function(row) {
                    return {
                        cruise_port: row[idx.cruise_port],
                        city: row[idx.city],
                        state: row[idx.state],
                        latitude: row[idx.latitude],
                        longitude: row[idx.longitude],
                        cruise_port_id: row[idx.cruise_port_id]
                    };
                });
                if (!portReviewQueue.length) return;
                portReviewIndex = 0;
                openPortDialog('review', portReviewQueue[0]);
            });
        }
    };
    $.fn.dataTable.ext.buttons.add_cruise = {
        text: 'Add cruise',
        action: function() { openTripDialog('add', null); }
    };

    // ---- Trip table quick filter (visited y/n) ----
    var currentTripFilter = 'upcoming';   // 'upcoming' | 'completed' | 'all'
    function tripFilterLabel(v) {
        if (v === 'completed') return 'Completed trips';
        if (v === 'all') return 'All trips';
        return 'Upcoming trips';
    }
    // visited_yn lives at column index 15 of #table_cruise_list. Custom search
    // hook keeps it independent of any column-search / SearchBuilder state.
    $.fn.dataTable.ext.search.push(function(settings, rowData) {
        if (!settings.nTable || settings.nTable.id !== 'table_cruise_list') return true;
        if (currentTripFilter === 'all') return true;
        var visited = String(rowData[15]);
        if (currentTripFilter === 'completed') return visited === '1';
        return visited === '0'; // upcoming
    });
    function applyTripFilter(value) {
        currentTripFilter = value;
        if (typeof $table_cruise_list !== 'undefined') {
            $table_cruise_list.draw();
            $table_cruise_list.button('trip_filter:name').text(tripFilterLabel(value));
        }
    }
    $.fn.dataTable.ext.buttons.trip_filter = {
        extend: 'collection',
        text: tripFilterLabel('upcoming'),
        name: 'trip_filter',
        autoClose: true,
        buttons: [
            { text: 'Upcoming trips',  action: function() { applyTripFilter('upcoming'); } },
            { text: 'Completed trips', action: function() { applyTripFilter('completed'); } },
            { text: 'All trips',       action: function() { applyTripFilter('all'); } }
        ]
    };
    $.fn.dataTable.ext.buttons.add_traveler = {
        text: 'Add traveler',
        action: function() { openTravelerDialog('add', null); }
    };

    // ---- Traveler dialog (tabbed: details / airline rewards / cruise rewards) ----
    var $dialog_traveler_detail = $('#dialog_traveler_detail').dialog({
        autoOpen: false,
        modal: true,
        title: 'Traveler',
        width: Math.min(900, window_width * 0.85),
        height: Math.min(720, window_height * 0.9),
        buttons: [
            { text: 'Save', class: 'ui-button ui-widget ui-corner-all', click: function() {
                saveTraveler().done(function() {
                    if (typeof $table_traveler_list !== 'undefined') {
                        $table_traveler_list.ajax.reload(null, false);
                    }
                    refreshLookup('passengers');
                    $dialog_traveler_detail.dialog('close');
                }).fail(function(xhr) {
                    if (xhr && xhr.responseText) alert('Save failed: ' + xhr.responseText);
                });
            }},
            { text: 'Cancel', class: 'ui-button ui-widget ui-corner-all', click: function() {
                $dialog_traveler_detail.dialog('close');
            }}
        ]
    });
    $('#traveler_detail_tabs').tabs();

    function clearTravelerFields() {
        $('#traveler_detail_passenger_id, #traveler_detail_passenger_name, ' +
          '#traveler_detail_passenger_abbr, #traveler_detail_home_city, ' +
          '#traveler_detail_home_airport, #traveler_detail_known_traveler_number, ' +
          '#traveler_detail_passport_number, #traveler_detail_passport_expiration_date').val('');
        $('#traveler_airline_table tbody').empty();
        $('#traveler_cruise_table tbody').empty();
    }

    function setTravelerFields(t) {
        clearTravelerFields();
        $('#traveler_detail_passenger_id').val(t.passenger_id != null ? t.passenger_id : '');
        $('#traveler_detail_passenger_name').val(t.passenger_name || '');
        $('#traveler_detail_passenger_abbr').val(t.passenger_abbr || '');
        $('#traveler_detail_home_city').val(t.home_city || '');
        $('#traveler_detail_home_airport').val(t.home_airport || '');
        $('#traveler_detail_known_traveler_number').val(t.known_traveler_number || '');
        $('#traveler_detail_passport_number').val(t.passport_number || '');
        $('#traveler_detail_passport_expiration_date').val(t.passport_expiration_date || '');
    }

    // ---- airline reward rows ----
    function airlineLabel(a) {
        var label = a.airline_name || ('airline ' + a.airline_id);
        if (a.airline_reward_program) label += ' — ' + a.airline_reward_program;
        return label;
    }

    function addAirlineRow(member) {
        member = member || {};
        var options = '<option value="">-- select airline --</option>';
        tripLookups.airlines.forEach(function(a) {
            var sel = String(a.airline_id) === String(member.airline_id) ? ' selected' : '';
            options += '<option value="' + a.airline_id + '"' + sel + '>' +
                escapeHtml(airlineLabel(a)) + '</option>';
        });
        var $row = $(
            '<tr>' +
                '<td><select class="form-control trav-air-id">' + options + '</select></td>' +
                '<td><input type="text" class="form-control trav-air-num" value="' +
                    escapeHtml(member.member_number || '') + '"></td>' +
                '<td><button type="button" class="ui-button ui-widget ui-corner-all trav-air-remove">&times;</button></td>' +
            '</tr>'
        );
        $row.find('.trav-air-remove').on('click', function() { $row.remove(); });
        $('#traveler_airline_table tbody').append($row);
    }

    $('#traveler_airline_add_row').on('click', function() { addAirlineRow(null); });

    function getAirlineRewardRows() {
        var rows = [];
        $('#traveler_airline_table tbody tr').each(function() {
            var airlineId = parseInt($(this).find('.trav-air-id').val(), 10);
            if (isNaN(airlineId)) return;
            rows.push({
                airline_id: airlineId,
                member_number: $(this).find('.trav-air-num').val().trim() || null
            });
        });
        return rows;
    }

    function rebuildAirlineRowDropdowns() {
        $('#traveler_airline_table tbody tr').each(function() {
            var $sel = $(this).find('.trav-air-id');
            var current = $sel.val();
            var html = '<option value="">-- select airline --</option>';
            tripLookups.airlines.forEach(function(a) {
                var sel = String(a.airline_id) === String(current) ? ' selected' : '';
                html += '<option value="' + a.airline_id + '"' + sel + '>' +
                    escapeHtml(airlineLabel(a)) + '</option>';
            });
            $sel.html(html);
        });
    }

    // ---- cruise reward rows ----
    function buildRewardLevelOptions(cruiseLineId, currentLevel) {
        var html = '<option value="">--</option>';
        var hasMatch = false;
        if (cruiseLineId) {
            tripLookups.cruise_line_reward_levels.forEach(function(lv) {
                if (String(lv.cruise_line_id) !== String(cruiseLineId)) return;
                var sel = currentLevel != null && currentLevel !== '' &&
                          String(lv.program_level) === String(currentLevel);
                if (sel) hasMatch = true;
                var range = '(' + (lv.min_points != null ? lv.min_points : '?') +
                            ' to ' + (lv.max_points != null ? lv.max_points : '?') + ' points)';
                var label = (lv.program_level_name || ('Level ' + lv.program_level)) + ' ' + range;
                html += '<option value="' + lv.program_level + '"' + (sel ? ' selected' : '') + '>' +
                    escapeHtml(label) + '</option>';
            });
        }
        // preserve a saved level even if there's no matching lookup row, so it isn't lost on save
        if (currentLevel != null && currentLevel !== '' && !hasMatch) {
            html += '<option value="' + escapeHtml(String(currentLevel)) +
                '" selected>Level ' + escapeHtml(String(currentLevel)) + '</option>';
        }
        return html;
    }

    function addCruiseRewardRow(member) {
        member = member || {};
        var lineOptions = '<option value="">-- select cruise line --</option>';
        tripLookups.cruise_lines.forEach(function(l) {
            var sel = String(l.cruise_line_id) === String(member.cruise_line_id) ? ' selected' : '';
            lineOptions += '<option value="' + l.cruise_line_id + '"' + sel + '>' +
                escapeHtml(l.cruise_line) + '</option>';
        });
        var levelOptions = buildRewardLevelOptions(member.cruise_line_id, member.current_program_level);
        var $row = $(
            '<tr>' +
                '<td><select class="form-control trav-cruz-id">' + lineOptions + '</select></td>' +
                '<td><input type="text" class="form-control trav-cruz-num" value="' +
                    escapeHtml(member.member_number || '') + '"></td>' +
                '<td><select class="form-control trav-cruz-level">' + levelOptions + '</select></td>' +
                '<td><input type="number" step="any" class="form-control trav-cruz-points" value="' +
                    (member.current_points != null ? member.current_points : '') + '"></td>' +
                '<td><button type="button" class="ui-button ui-widget ui-corner-all trav-cruz-remove">&times;</button></td>' +
            '</tr>'
        );
        $row.find('.trav-cruz-remove').on('click', function() { $row.remove(); });
        $row.find('.trav-cruz-id').on('change', function() {
            // changed cruise line -> rebuild level dropdown for new line, clear selection
            $row.find('.trav-cruz-level').html(buildRewardLevelOptions($(this).val(), ''));
        });
        $('#traveler_cruise_table tbody').append($row);
    }

    $('#traveler_cruise_add_row').on('click', function() { addCruiseRewardRow(null); });

    function getCruiseRewardRows() {
        var rows = [];
        $('#traveler_cruise_table tbody tr').each(function() {
            var lineId = parseInt($(this).find('.trav-cruz-id').val(), 10);
            if (isNaN(lineId)) return;
            var levelRaw = $(this).find('.trav-cruz-level').val();
            var pointsRaw = $(this).find('.trav-cruz-points').val();
            rows.push({
                cruise_line_id: lineId,
                member_number: $(this).find('.trav-cruz-num').val().trim() || null,
                current_program_level: levelRaw === '' ? null : levelRaw,
                current_points: pointsRaw === '' ? null : pointsRaw
            });
        });
        return rows;
    }

    function rebuildCruiseRewardRowDropdowns() {
        $('#traveler_cruise_table tbody tr').each(function() {
            var $sel = $(this).find('.trav-cruz-id');
            var current = $sel.val();
            var html = '<option value="">-- select cruise line --</option>';
            tripLookups.cruise_lines.forEach(function(l) {
                var sel = String(l.cruise_line_id) === String(current) ? ' selected' : '';
                html += '<option value="' + l.cruise_line_id + '"' + sel + '>' +
                    escapeHtml(l.cruise_line) + '</option>';
            });
            $sel.html(html);
        });
    }

    // ---- airline sub-dialog (Add new airline) ----
    var airlineDialogOnSaved = null;
    var $dialog_airline_detail = $('#dialog_airline_detail').dialog({
        autoOpen: false, modal: true, title: 'Add airline',
        width: Math.min(720, window_width * 0.85),
        close: function() { airlineDialogOnSaved = null; },
        buttons: [
            { text: 'Save', class: 'ui-button ui-widget ui-corner-all', click: function() {
                var name = $('#airline_detail_airline_name').val().trim();
                if (!name) { alert('Airline name is required.'); return; }
                $.ajax({
                    url: base_url + 'data/airline', method: 'POST',
                    contentType: 'application/json',
                    data: JSON.stringify({
                        airline_name: name,
                        airline_abbr: $('#airline_detail_airline_abbr').val().trim() || null,
                        airline_url: $('#airline_detail_airline_url').val().trim() || null,
                        airline_reward_program: $('#airline_detail_airline_reward_program').val().trim() || null
                    })
                }).done(function(resp) {
                    var cb = airlineDialogOnSaved;
                    $dialog_airline_detail.dialog('close');
                    if (cb) cb(resp.airline_id);
                }).fail(function(xhr) {
                    if (xhr && xhr.responseText) alert('Save failed: ' + xhr.responseText);
                });
            }},
            { text: 'Cancel', class: 'ui-button ui-widget ui-corner-all', click: function() {
                $dialog_airline_detail.dialog('close');
            }}
        ]
    });

    function openAirlineDialog(onSaved) {
        airlineDialogOnSaved = onSaved || null;
        $('#airline_detail_airline_name, #airline_detail_airline_abbr, ' +
          '#airline_detail_airline_url, #airline_detail_airline_reward_program').val('');
        $dialog_airline_detail.dialog('open');
    }

    $('#traveler_airline_add_new').on('click', function() {
        openAirlineDialog(function() {
            refreshLookup('airlines').done(rebuildAirlineRowDropdowns);
        });
    });

    $('#traveler_cruise_add_new').on('click', function() {
        openLineDialog(function() {
            refreshLookup('cruise_lines').done(rebuildCruiseRewardRowDropdowns);
        });
    });

    function openTravelerDialog(mode, id) {
        loadTripLookups().done(function() {
            if (mode === 'edit' && id) {
                $('#traveler_detail_tabs').tabs('option', 'disabled', false);
                $.when(
                    $.getJSON(base_url + 'data/traveler/' + id),
                    $.getJSON(base_url + 'data/traveler/' + id + '/airline_rewards'),
                    $.getJSON(base_url + 'data/traveler/' + id + '/cruise_rewards')
                ).done(function(travResp, airResp, cruzResp) {
                    setTravelerFields(travResp[0]);
                    (airResp[0] || []).forEach(function(m) { addAirlineRow(m); });
                    (cruzResp[0] || []).forEach(function(m) { addCruiseRewardRow(m); });
                    $dialog_traveler_detail.dialog('option', 'title', 'Edit traveler');
                    $dialog_traveler_detail.dialog('open');
                }).fail(function() { alert('Could not load traveler ' + id); });
            } else {
                setTravelerFields({});
                // disable rewards tabs (1 and 2) until traveler is saved at least once
                $('#traveler_detail_tabs').tabs('option', 'disabled', [1, 2]);
                $dialog_traveler_detail.dialog('option', 'title', 'Add traveler');
                $dialog_traveler_detail.dialog('open');
            }
        });
    }

    function saveTraveler() {
        var name = $('#traveler_detail_passenger_name').val().trim();
        if (!name) {
            alert('Name is required.');
            return $.Deferred().reject().promise();
        }
        var payload = {
            passenger_name: name,
            passenger_abbr: $('#traveler_detail_passenger_abbr').val().trim() || null,
            home_city: $('#traveler_detail_home_city').val().trim() || null,
            home_airport: $('#traveler_detail_home_airport').val().trim().toUpperCase() || null,
            known_traveler_number: $('#traveler_detail_known_traveler_number').val().trim() || null,
            passport_number: $('#traveler_detail_passport_number').val().trim() || null,
            passport_expiration_date: $('#traveler_detail_passport_expiration_date').val() || null
        };
        var existingId = $('#traveler_detail_passenger_id').val();
        var url = existingId ? base_url + 'data/traveler/' + existingId : base_url + 'data/traveler';
        var method = existingId ? 'PUT' : 'POST';
        return $.ajax({
            url: url, method: method,
            contentType: 'application/json',
            data: JSON.stringify(payload)
        }).then(function(resp) {
            var newId = resp.passenger_id;
            // If we're in add mode, rewards tabs were disabled so skip persisting their (empty) tables.
            if (!existingId) return newId;
            return $.ajax({
                url: base_url + 'data/traveler/' + newId + '/airline_rewards',
                method: 'PUT', contentType: 'application/json',
                data: JSON.stringify({ members: getAirlineRewardRows() })
            }).then(function() {
                return $.ajax({
                    url: base_url + 'data/traveler/' + newId + '/cruise_rewards',
                    method: 'PUT', contentType: 'application/json',
                    data: JSON.stringify({ members: getCruiseRewardRows() })
                });
            }).then(function() { return newId; });
        });
    }

    let draw = false;

    function setTableEvents(table) {
        // listen for page clicks
        table.on("page", () => {
            draw = true;
        });
 
        // listen for updates and adjust the chart accordingly
        table.on("draw", () => {
            if (draw) {
                draw = false;
            } else {
                var cruise_trip_ids = getTableCruiseTripIDs($table_cruise_list);  
                    // console.log(account_ids);
                refreshCruiseMapChart(cruise_trip_ids);
            };
        });
    };

    function setPortTableEvents(table) {
        // listen for page clicks
        table.on("page", () => {
            draw = true;
        });
 
        // listen for updates and adjust the chart accordingly
        table.on("draw", () => {
            if (draw) {
                draw = false;
            } else {
                var cruise_port_ids = getTableCruisePortIDs($table_port_list);
                refreshPortMapChart(cruise_port_ids);
            };
        });
    };    
    
    function refreshCruiseMapChart(cruise_trip_ids) {
        $.getJSON('/data/chart_cruise_ports?cruise_trip_ids=' + cruise_trip_ids, function(data) {
            
            // Group data by trip_id
            const groups = data.reduce((acc, row) => {
                if (!acc[row.cruise_trip_id]) acc[row.cruise_trip_id] = [];
                acc[row.cruise_trip_id].push(row);
                return acc;
            }, {});

            const map_data = Object.keys(groups).map((tripId) => {
                const tripPoints = groups[tripId];
                let lat = [], lon = [], hoverTexts = [], markerOpacities = [];
                let prevLon = null;

                tripPoints.forEach((port, index) => {
                    // If there is a sea_path, add all its waypoints
                    if (port.sea_path) {
                        port.sea_path.forEach((coord, i) => {
                            let currentLon = unwrapLon(coord[0], prevLon);
                            lon.push(currentLon);
                            lat.push(coord[1]);
                            // Only show marker/text for the actual port (first point of path)
                            if (i === 0) {
                                hoverTexts.push("stop: " + port.city);
                                markerOpacities.push(1);
                            } else {
                                hoverTexts.push(null);
                                markerOpacities.push(0);
                            }
                            prevLon = currentLon;
                        });
                    } else {
                        // Fallback for the very last port in a trip
                        let currentLon = unwrapLon(port.longitude, prevLon);
                        lon.push(currentLon);
                        lat.push(port.latitude);
                        hoverTexts.push("stop: " + port.city);
                        markerOpacities.push(1);
                    }
                });

                return {
                    type: 'scattermapbox',
                    name: 'Trip ' + tripId,
                    lat: lat,
                    lon: lon,
                    mode: 'lines+markers',
                    text: hoverTexts,
                    hoverinfo: 'text',
                    customdata: lat.map(function() { return tripId; }),
                    marker: { size: 10, opacity: markerOpacities },
                    line: { width: 2 }
                };
            });

            // Use renderPlot function
            renderPlot(map_data, data);
        });
    };

    // cruise port map chart data function
    function refreshPortMapChart(cruise_port_ids) {
        $.getJSON('/data/chart_ports?cruise_port_ids=' + cruise_port_ids, function(data) {
            var groups = { 'been there': [], 'booked': [], 'want to go': [] };
            data.forEach(function(item) {
                (groups[item.port_category] || groups['want to go']).push(item);
            });
            function buildTrace(items, name, marker, opts) {
                var trace = {
                    type: 'scattermapbox',
                    name: name,
                    lat: items.map(function(p) { return p.latitude; }),
                    lon: items.map(function(p) { return p.longitude; }),
                    mode: 'markers',
                    marker: marker,
                    text: items.map(function(p) { return p.cruise_port; }),
                    customdata: items.map(function(p) { return p.cruise_port_id; })
                };
                if (opts) Object.assign(trace, opts);
                return trace;
            }
            var chart_data = [];
            if (groups['been there'].length) {
                // visited: solid gold dot
                chart_data.push(buildTrace(groups['been there'], 'visited',
                    { size: 14, color: '#BD9B60' }));
            }
            if (groups['booked'].length) {
                // booked: gold dot with cream center -> "ring" effect
                chart_data.push(buildTrace(groups['booked'], 'booked',
                    { size: 14, color: '#BD9B60' }));
                chart_data.push(buildTrace(groups['booked'], 'booked',
                    { size: 7, color: '#F8F6F1' },
                    { showlegend: false, hoverinfo: 'skip' }));
            }
            if (groups['want to go'].length) {
                chart_data.push(buildTrace(groups['want to go'], 'want to go',
                    { size: 8, color: '#0D2240' }));
            }
            renderPortPlot(chart_data, data);
        });
    };

    // main tab map chart
    function renderPlot(map_data, originalData) {
        
        var myPlot = document.getElementById('cruise_map_chart');

        var lats = originalData.map(r => r.latitude);
        var lons = originalData.map(r => r.longitude);
        
        var layout = {
            mapbox: {
                accesstoken: mapbox_key,
                style: "streets",
                center: { 
                    lat: lats.reduce((a, b) => a + b) / lats.length, 
                    lon: lons.reduce((a, b) => a + b) / lons.length 
                },
                zoom: 1.5
            },
            // height: 300,
            margin: { r: 0, t: 0, b: 0, l: 0 }
        };
        Plotly.newPlot('cruise_map_chart', map_data, layout);

        myPlot.on('plotly_click', function(data) {
            var point = data.points[0];
            var trip_id = point.customdata;
            if (trip_id != null) openTripDialog('edit', trip_id);
        });
    };
    // port tab map chart
    // Plotly's scattermapbox marker doesn't support fill+stroke, so the
    // "booked" map marker is drawn as two overlaid traces (gold outer + cream
    // inner). The legend only shows one trace per name, so we re-style its
    // swatch into a gold ring so it mirrors the on-map look.
    function patchBookedLegendDot(plotEl) {
        if (!plotEl) return;
        var items = plotEl.querySelectorAll('g.traces');
        items.forEach(function(item) {
            var txt = item.querySelector('.legendtext');
            if (!txt || txt.textContent.trim() !== 'booked') return;
            var path = item.querySelector('.legendpoints path');
            if (!path) return;
            // Re-apply on every call: Plotly reuses the same path element
            // across redraws and overwrites our fill/stroke each time.
            path.setAttribute('stroke', '#BD9B60');
            path.setAttribute('stroke-width', '3');
            path.style.fill = '#F8F6F1';
            path.style.stroke = '#BD9B60';
            path.style.strokeWidth = '3px';
        });
    }

    function renderPortPlot(map_data, originalData) {

        var myPlot = document.getElementById('port_chart');

        var lats = originalData.map(r => r.latitude);
        var lons = originalData.map(r => r.longitude);

        var layout = {
            mapbox: {
                accesstoken: mapbox_key,
                style: "streets",
                center: {
                    lat: lats.reduce((a, b) => a + b) / lats.length,
                    lon: lons.reduce((a, b) => a + b) / lons.length
                },
                zoom: 3
            },
            margin: { r: 0, t: 0, b: 0, l: 0 }
        };
        Plotly.newPlot('port_chart', map_data, layout, {responsive: true})
            .then(function() { patchBookedLegendDot(myPlot); });
        // legend redraws on resize, legend toggle, etc. — re-apply each time.
        myPlot.on('plotly_afterplot', function() { patchBookedLegendDot(myPlot); });

        myPlot.on('plotly_click', function(data) {
            var point = data.points[0];
            var port_id = point.customdata;
            var record = (originalData || []).find(function(p) {
                return p.cruise_port_id === port_id;
            });
            if (record) openPortDialog('edit', record);
        });
    };
    
    // function to get cruise_trip_ids from the table
    function getTableCruiseTripIDs(table) {
        var cruise_trip_ids = [];
        // iterate over table rows
        table.rows({ search: "applied" }).every(function() {
            var data = this.data();
            var cruise_trip_id = data[7];
            cruise_trip_ids.push(cruise_trip_id);
        });
        return cruise_trip_ids;
    };
    function getTableCruisePortIDs(table) {
        var cruise_port_ids = [];
        // iterate over table rows
        table.rows({ search: "applied" }).every(function() {
            var data = this.data();
            var cruise_port_id = data[5];
            cruise_port_ids.push(cruise_port_id);
        });
        // console.log(cruise_port_ids)
        return cruise_port_ids;        
    };

    // setup cruise list table
    var $table_cruise_list = $('#table_cruise_list').DataTable({
        dom: 'Bfrtip',
        'ajax': {
            url: base_url + 'data/cruise_trip_table',
            dataSrc: 'data'
        },
        'columns': [
            { title: "cruise #"},
            { title: "name" },
            { title: "cruise line" },
            { title: "departing" },
            { title: "arriving" },
            { title: "start/end port(s)" },
            { title: "stops" },
            { title: "cruise trip id", visible: false },
            { title: "book date", visible: false },
            { title: "company", visible: false },
            { title: "ship name", visible: false },
            { title: "suite y/n", visible: false },
            { title: "deck #", visible: false },
            { title: "room #", visible: false },
            { title: "occupancy", visible: false },
            { title: "visited y/n", visible: false }
        ],
        columnDefs: [
            {
                targets: '_all',      // Apply to all columns
                className: 'dt-head-center' 
            }
        ],   
        order: [[0, 'asc']],             
        searchBuilder: true,
        language: {
            searchBuilder: {
                add: '+',
                condition: 'Comparator',
                clearAll: 'Reset',
                delete: 'Delete',
                deleteTitle: 'Delete Title',
                data: 'Column',
                left: 'Left',
                leftTitle: 'Left Title',
                logicAnd: '&&',
                logicOr: '||',
                right: 'Right',
                rightTitle: 'Right Title',
                title: {
                    0: 'Filters',
                    _: 'Filters (%d)'
                },
                value: 'Option',
                valueJoiner: 'et'
            }
        },
        responsive: true,
		buttons: [
			'pageLength', 'trip_filter', 'copy', 'csv', 'excel', 'pdf', 'print', 'add_cruise'
		],
        "lengthMenu": [[3, 5, 10, 20, -1], [3, 5, 10, 20, "All"]]
    });
    $table_cruise_list.searchBuilder.container().prependTo($table_cruise_list.table().container());

    // link to the appropriate chart
    setTableEvents($table_cruise_list);

    // double-click a trip row to open the edit dialog
    $('#table_cruise_list tbody').on('dblclick', 'tr', function() {
        var rowData = $table_cruise_list.row(this).data();
        if (!rowData) return;
        var tripId = rowData[7]; // cruise trip id column (hidden)
        if (tripId != null) openTripDialog('edit', tripId);
    });

    // cruise ports table
    var $table_port_list = $('#table_port_list').DataTable({
        dom: 'Bfrtip',
        'ajax': {
            url: base_url + 'data/port_list_table',
            dataSrc: 'data'
        },
        'columns': [
            { title: "cruise port"},
            { title: "city" },
            { title: "state/country" },
            { title: "latitude" },
            { title: "longitude" },
            { title: "cruise port id", visible: false }
        ],
        columnDefs: [
            {
                targets: '_all',      // Apply to all columns
                className: 'dt-head-center' 
            }
        ],   
        order: [[0, 'asc']],             
        searchBuilder: true,
        language: {
            searchBuilder: {
                add: '+',
                condition: 'Comparator',
                clearAll: 'Reset',
                delete: 'Delete',
                deleteTitle: 'Delete Title',
                data: 'Column',
                left: 'Left',
                leftTitle: 'Left Title',
                logicAnd: '&&',
                logicOr: '||',
                right: 'Right',
                rightTitle: 'Right Title',
                title: {
                    0: 'Filters',
                    _: 'Filters (%d)'
                },
                value: 'Option',
                valueJoiner: 'et'
            }
        },
        responsive: true,
		buttons: [
			'pageLength', 'copy', 'csv', 'excel', 'pdf', 'print', 'add_port', 'review_ports'
		],
        "lengthMenu": [[5, 10, 20, -1], [5, 10, 20, "All"]]
    });
    $table_port_list.searchBuilder.container().prependTo($table_port_list.table().container());

    // link to the appropriate chart
    setPortTableEvents($table_port_list);

    // ---- Travelers table ----
    var $table_traveler_list = $('#table_traveler_list').DataTable({
        dom: 'Bfrtip',
        'ajax': {
            url: base_url + 'data/traveler_table',
            dataSrc: 'data'
        },
        'columns': [
            { title: "name" },
            { title: "abbr" },
            { title: "home city" },
            { title: "home airport" },
            { title: "known traveler #" },
            { title: "passport #" },
            { title: "passport expiration" },
            { title: "passenger id", visible: false }
        ],
        columnDefs: [
            { targets: '_all', className: 'dt-head-center' }
        ],
        order: [[0, 'asc']],
        responsive: true,
        buttons: [
            'pageLength', 'copy', 'csv', 'excel', 'pdf', 'print', 'add_traveler'
        ],
        "lengthMenu": [[5, 10, 20, -1], [5, 10, 20, "All"]]
    });

    $('#table_traveler_list tbody').on('dblclick', 'tr', function() {
        var rowData = $table_traveler_list.row(this).data();
        if (!rowData) return;
        openTravelerDialog('edit', rowData[7]);
    });

    // double-click a port row to edit it (same dialog as clicking a map marker)
    $('#table_port_list tbody').on('dblclick', 'tr', function() {
        var rowData = $table_port_list.row(this).data();
        if (!rowData) return;
        openPortDialog('edit', {
            cruise_port: rowData[0],
            city: rowData[1],
            state: rowData[2],
            latitude: rowData[3],
            longitude: rowData[4],
            cruise_port_id: rowData[5]
        });
    });

});