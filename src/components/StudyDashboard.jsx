import React, { useState, useEffect, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import { 
  Flame, 
  Target, 
  BookOpen, 
  Calendar, 
  ChevronDown, 
  ChevronUp,
  Play, 
  Clock, 
  HelpCircle, 
  Bookmark, 
  ChevronLeft, 
  ChevronRight, 
  TrendingUp, 
  BarChart2, 
  Award, 
  History, 
  AlertCircle,
  Video,
  ArrowRight,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { invoke } from "@tauri-apps/api/tauri";

// Visual Count-up animation helper component
function AnimatedNumber({ value, formatter = (v) => v }) {
  const [displayValue, setDisplayValue] = useState(0);
  const startValRef = useRef(0);
  const endVal = parseInt(value, 10) || 0;

  useEffect(() => {
    let active = true;
    const start = startValRef.current;
    const end = endVal;
    
    if (start === end) {
      setDisplayValue(end);
      return;
    }
    
    const duration = 800; // 0.8s animation duration
    const startTime = performance.now();
    
    const animate = (now) => {
      if (!active) return;
      const elapsed = now - startTime;
      const progress = Math.min(1.0, elapsed / duration);
      // Ease-out quad formula
      const ease = progress * (2 - progress);
      const current = Math.floor(start + (end - start) * ease);
      setDisplayValue(current);
      
      if (progress < 1.0) {
        requestAnimationFrame(animate);
      } else {
        setDisplayValue(end);
        startValRef.current = end;
      }
    };
    
    requestAnimationFrame(animate);
    return () => {
      active = false;
    };
  }, [endVal]);

  return <span>{formatter(displayValue)}</span>;
}

// Collapsible Daily Study Dashboard Widget
export default function StudyDashboard({ 
  studyStats, 
  dailyStudyGoal,
  libraryStats = [],
  playlists = [],
  onPlayBookmarkVideo,
  setActiveView,
  setRevisionFilter,
  onSelectPlaylist
}) {
  const [isDashboardOpen, setIsDashboardOpen] = useState(() => {
    return localStorage.getItem("lectura_dashboard_expanded") !== "false";
  });
  
  // Dashboard tab: "overview" | "courses" | "daily_activity"
  const [activeTab, setActiveTab] = useState("overview");

  // Heatmap hover states
  const [hoveredDate, setHoveredDate] = useState(null);
  const [hoveredDay, setHoveredDay] = useState(null);
  const [selectedYear, setSelectedYear] = useState("last_year");

  // Digital Wellbeing Date selection
  const getTodayDateString = () => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const todayStr = getTodayDateString();

  // Daily Activity Tab states
  const [weekEndDate, setWeekEndDate] = useState(todayStr);
  const [selectedDayIndex, setSelectedDayIndex] = useState(6); // Today/End date (last item in chronological order) selected by default
  const [weekData, setWeekData] = useState([]);
  const [isWeekLoading, setIsWeekLoading] = useState(false);
  const [hoveredHour, setHoveredHour] = useState(null);

  // Custom Calendar Popover states
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [calendarYear, setCalendarYear] = useState(() => new Date(todayStr + "T00:00:00").getFullYear());
  const [calendarMonth, setCalendarMonth] = useState(() => new Date(todayStr + "T00:00:00").getMonth());

  // Sync calendar display month/year when weekEndDate changes (e.g. via cell clicks)
  useEffect(() => {
    const d = new Date(weekEndDate + "T00:00:00");
    setCalendarYear(d.getFullYear());
    setCalendarMonth(d.getMonth());
  }, [weekEndDate]);

  const handleCalendarMonthChange = (direction) => {
    let nextMonth = calendarMonth + direction;
    let nextYear = calendarYear;
    if (nextMonth < 0) {
      nextMonth = 11;
      nextYear -= 1;
    } else if (nextMonth > 11) {
      nextMonth = 0;
      nextYear += 1;
    }
    setCalendarYear(nextYear);
    setCalendarMonth(nextMonth);
  };

  const generateCalendarDays = () => {
    const firstDayIndex = new Date(calendarYear, calendarMonth, 1).getDay();
    const daysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();
    
    const elements = [];
    
    // Blank cells before first day of month
    for (let i = 0; i < firstDayIndex; i++) {
      elements.push(<div key={`empty-${i}`} className="w-[24px] h-[24px]" />);
    }
    
    const todayObj = new Date();
    todayObj.setHours(23, 59, 59, 999);
    
    for (let day = 1; day <= daysInMonth; day++) {
      const currentDate = new Date(calendarYear, calendarMonth, day);
      const yearStr = calendarYear;
      const monthStr = String(calendarMonth + 1).padStart(2, "0");
      const dayStr = String(day).padStart(2, "0");
      const dateString = `${yearStr}-${monthStr}-${dayStr}`;
      
      const isDisabled = currentDate > todayObj;
      const isSelected = dateString === weekEndDate;
      const isDayToday = dateString === todayStr;

      elements.push(
        <button
          key={day}
          disabled={isDisabled}
          onClick={() => {
            setWeekEndDate(dateString);
            setSelectedDayIndex(6); // Reset selection to focus day
            setIsCalendarOpen(false);
          }}
          className={`w-[24px] h-[24px] rounded-md text-[9px] font-extrabold flex items-center justify-center transition-all cursor-pointer select-none ${
            isSelected 
              ? "bg-primary text-primary-foreground shadow-sm"
              : isDayToday
                ? "bg-primary/15 text-primary border border-primary/30"
                : "text-foreground hover:bg-muted/65"
          } ${isDisabled ? "opacity-25 cursor-not-allowed hover:bg-transparent text-muted-foreground" : ""}`}
        >
          {day}
        </button>
      );
    }
    
    return elements;
  };

  // Helper to calculate 7 dates in local time ending on endDateStr (chronological order)
  const getWeekDates = (endDateStr) => {
    const dates = [];
    const end = new Date(endDateStr + "T00:00:00");
    for (let i = 6; i >= 0; i--) {
      const d = new Date(end);
      d.setDate(end.getDate() - i);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      dates.push(`${yyyy}-${mm}-${dd}`);
    }
    return dates;
  };

  // Fetch 7 days of wellbeing details when weekEndDate or studyStats changes
  useEffect(() => {
    let active = true;
    const dates = getWeekDates(weekEndDate);
    
    // Set loading state only if the week dates have actually changed to avoid flickering
    setWeekData(prev => {
      const hasSameDates = prev.length === dates.length && prev.every((item, idx) => item.date === dates[idx]);
      if (hasSameDates) {
        return prev;
      }
      setIsWeekLoading(true);
      return dates.map(date => ({ date, loading: true, details: null }));
    });

    const fetchAllWeekDetails = async () => {
      const promises = dates.map(async (date) => {
        try {
          const details = await invoke("get_day_study_details", { dateStr: date });
          return { date, loading: false, details };
        } catch (err) {
          console.error(`Failed to fetch stats for ${date}:`, err);
          return { date, loading: false, details: null, error: true };
        }
      });
      
      const results = await Promise.all(promises);
      if (active) {
        setWeekData(results);
        setIsWeekLoading(false);
      }
    };

    fetchAllWeekDetails();
    return () => {
      active = false;
    };
  }, [weekEndDate, studyStats]);

  const logYears = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const years = new Set([currentYear, currentYear - 1]);
    if (studyStats?.daily_logs) {
      Object.keys(studyStats.daily_logs).forEach(dateStr => {
        const year = parseInt(dateStr.split("-")[0], 10);
        if (year) years.add(year);
      });
    }
    return Array.from(years).sort((a, b) => b - a);
  }, [studyStats?.daily_logs]);

  const handleHeatmapCellClick = (dateStr) => {
    setWeekEndDate(dateStr);
    setSelectedDayIndex(6); // Clicked date is weekEndDate, which is index 6
    setActiveTab("daily_activity");
  };

  useEffect(() => {
    localStorage.setItem("lectura_dashboard_expanded", isDashboardOpen);
  }, [isDashboardOpen]);

  // Format minutes to hours and minutes
  const formatMinsToDuration = (totalMins) => {
    if (!totalMins || totalMins <= 0) return "0m";
    const h = Math.floor(totalMins / 60);
    const m = totalMins % 60;
    if (h > 0) {
      return `${h}h ${m}m`;
    }
    return `${m}m`;
  };

  const formatSecondsToDuration = (totalSecs) => {
    if (!totalSecs || totalSecs <= 0) return "0m";
    const mins = Math.floor(totalSecs / 60);
    if (mins === 0) return `${totalSecs}s`;
    return formatMinsToDuration(mins);
  };

  const formatSecondsToShortDuration = (totalSecs) => {
    if (!totalSecs || totalSecs <= 0) return "0m";
    const mins = Math.floor(totalSecs / 60);
    if (mins === 0) {
      return `${Math.round(totalSecs)}s`;
    }
    if (mins < 60) {
      return `${mins}m`;
    }
    const hrs = (mins / 60).toFixed(1);
    return `${hrs.endsWith(".0") ? hrs.slice(0, -2) : hrs}h`;
  };

  const todaySeconds = studyStats?.daily_logs?.[todayStr] || 0;
  const todayMinutes = Math.floor(todaySeconds / 60);
  
  const goalProgress = dailyStudyGoal > 0 
    ? Math.min(100, Math.round((todayMinutes / dailyStudyGoal) * 100)) 
    : 0;

  // Streak calculations
  const calculateStreak = (dailyLogs = {}, goalMins) => {
    let currentStreak = 0;
    let bestStreak = 0;
    let tempStreak = 0;
    
    const oneDayMs = 24 * 60 * 60 * 1000;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const logDates = Object.keys(dailyLogs).sort();
    if (logDates.length === 0) return { current: 0, best: 0 };
    
    let lastDate = null;
    for (const dateStr of logDates) {
      const seconds = dailyLogs[dateStr] || 0;
      const mins = seconds / 60;
      const currentDate = new Date(dateStr + "T00:00:00");
      
      if (mins >= goalMins) {
        if (lastDate) {
          const diff = (currentDate - lastDate) / oneDayMs;
          if (diff <= 1.1) {
            tempStreak += 1;
          } else {
            tempStreak = 1;
          }
        } else {
          tempStreak = 1;
        }
        bestStreak = Math.max(bestStreak, tempStreak);
        lastDate = currentDate;
      } else {
        tempStreak = 0;
        lastDate = null;
      }
    }
    
    const goalSeconds = goalMins * 60;
    const yesterday = new Date(today.getTime() - oneDayMs);
    const yesterdayStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, "0")}-${String(yesterday.getDate()).padStart(2, "0")}`;
    const yesterdaySeconds = dailyLogs[yesterdayStr] || 0;
    
    const hitToday = todaySeconds >= goalSeconds;
    const hitYesterday = yesterdaySeconds >= goalSeconds;
    
    if (hitToday || hitYesterday) {
      let startTraceDate = hitToday ? today : yesterday;
      while (true) {
        const dateStr = `${startTraceDate.getFullYear()}-${String(startTraceDate.getMonth() + 1).padStart(2, "0")}-${String(startTraceDate.getDate()).padStart(2, "0")}`;
        const secs = dailyLogs[dateStr] || 0;
        if (secs >= goalSeconds) {
          currentStreak += 1;
          startTraceDate = new Date(startTraceDate.getTime() - oneDayMs);
        } else {
          break;
        }
      }
    }
    
    return { current: currentStreak, best: Math.max(bestStreak, currentStreak) };
  };

  const streak = useMemo(() => calculateStreak(studyStats?.daily_logs || {}, dailyStudyGoal), [studyStats?.daily_logs, dailyStudyGoal]);

  // Heatmap generation (full year)
  const heatmapDates = useMemo(() => {
    if (selectedYear === "last_year") {
      const today = new Date();
      const dayOfWeek = today.getDay();
      const saturdayThisWeek = new Date(today);
      saturdayThisWeek.setDate(today.getDate() + (6 - dayOfWeek));
      saturdayThisWeek.setHours(23, 59, 59, 999);
      
      const gridStartDate = new Date(saturdayThisWeek);
      gridStartDate.setDate(saturdayThisWeek.getDate() - 53 * 7 + 1);
      gridStartDate.setHours(0, 0, 0, 0);
      
      const dates = [];
      const current = new Date(gridStartDate);
      while (current <= saturdayThisWeek) {
        dates.push(new Date(current));
        current.setDate(current.getDate() + 1);
      }
      return dates;
    } else {
      const year = parseInt(selectedYear, 10);
      const yearStartDate = new Date(year, 0, 1);
      const dayOfWeek = yearStartDate.getDay();
      
      const gridStartDate = new Date(yearStartDate);
      gridStartDate.setDate(yearStartDate.getDate() - dayOfWeek);
      gridStartDate.setHours(0, 0, 0, 0);
      
      const yearEndDate = new Date(year, 11, 31);
      const endDayOfWeek = yearEndDate.getDay();
      
      const gridEndDate = new Date(yearEndDate);
      gridEndDate.setDate(yearEndDate.getDate() + (6 - endDayOfWeek));
      gridEndDate.setHours(23, 59, 59, 999);
      
      const dates = [];
      const current = new Date(gridStartDate);
      while (current <= gridEndDate) {
        dates.push(new Date(current));
        current.setDate(current.getDate() + 1);
      }
      return dates;
    }
  }, [selectedYear]);

  const weekCount = useMemo(() => Math.ceil(heatmapDates.length / 7), [heatmapDates]);

  const monthLabels = useMemo(() => {
    const labels = [];
    let lastMonth = -1;
    for (let col = 0; col < weekCount; col++) {
      const dayIndex = col * 7;
      if (dayIndex < heatmapDates.length) {
        const date = heatmapDates[dayIndex];
        const month = date.getMonth();
        
        let isValidDate = true;
        if (selectedYear !== "last_year") {
          isValidDate = date.getFullYear() === parseInt(selectedYear, 10);
        }
        
        if (isValidDate && month !== lastMonth) {
          if (labels.length === 0 || col - labels[labels.length - 1].colIndex >= 2) {
            labels.push({
              colIndex: col,
              name: date.toLocaleDateString(undefined, { month: "short" })
            });
            lastMonth = month;
          }
        }
      }
    }
    return labels;
  }, [heatmapDates, weekCount, selectedYear]);

  const totalStudyMinutes = Math.floor((studyStats?.total_study_seconds || 0) / 60);
  const totalCoveredMinutes = Math.floor((studyStats?.total_video_covered_seconds || 0) / 60);

  // SVG Progress Ring calculations
  const radius = 22;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (goalProgress / 100) * circumference;

  const formatFriendlyDate = (dateStr) => {
    if (!dateStr) return "";
    const dateObj = new Date(dateStr + "T00:00:00");
    const now = new Date();
    
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const yesterdayStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, "0")}-${String(yesterday.getDate()).padStart(2, "0")}`;

    if (dateStr === todayStr) {
      return `Today: ${dateObj.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}`;
    }
    if (dateStr === yesterdayStr) {
      return `Yesterday: ${dateObj.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}`;
    }
    
    return dateObj.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });
  };

  // Compile course study time mapping for the Course Stats tab
  const courseTimeDetails = useMemo(() => {
    return libraryStats.map(stat => {
      const playlist = playlists.find(p => p.id === stat.playlist_id);
      return {
        ...stat,
        playlist_title: playlist ? playlist.title : "Unassigned Playlist",
        thumbnail_url: playlist ? playlist.thumbnail_url : null,
      };
    }).sort((a, b) => (b.total_study_time || 0) - (a.total_study_time || 0));
  }, [libraryStats, playlists]);

  return (
    <>
      <div className="space-y-4 transition-all duration-300">
      
      {/* Flat Section Header (No outer card borders) */}
      <div className="flex items-center justify-between border-b border-border/40 pb-3">
        <div className="flex items-center gap-2">
          <TrendingUp size={16} className="text-primary animate-pulse" />
          <span className="text-xs font-extrabold tracking-wide text-foreground uppercase">
            Study Insights & Wellbeing
          </span>
        </div>
        <button
          onClick={() => setIsDashboardOpen(!isDashboardOpen)}
          className="text-[10px] font-bold text-muted-foreground hover:text-foreground bg-muted/20 hover:bg-muted/40 px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer flex items-center gap-1 select-none"
        >
          <span>{isDashboardOpen ? "Hide Details" : "Show Details"}</span>
          {isDashboardOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </button>
      </div>

      {/* Collapsible Content */}
      <div className={`transition-all duration-300 ease-in-out overflow-hidden ${
        isDashboardOpen ? "max-h-[1600px] opacity-100 py-1" : "max-h-0 opacity-0 pointer-events-none"
      }`}>
        
        {/* Navigation Tabs */}
        <div className="flex bg-muted/25 border border-border/40 p-1 rounded-xl mb-5 max-w-sm">
          {[
            { id: "overview", label: "Overview", icon: BarChart2 },
            { id: "courses", label: "Course Stats", icon: Award },
            { id: "daily_activity", label: "Daily Activity", icon: Clock },
          ].map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-grow flex items-center justify-center gap-1.5 py-2 px-1 rounded-lg text-[10px] font-bold transition-all duration-200 cursor-pointer ${
                  isActive 
                    ? "bg-background text-foreground shadow-sm ring-1 ring-border/20" 
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/15"
                }`}
              >
                <Icon size={12} className={isActive ? "text-primary" : "text-muted-foreground/80"} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* ───── TAB 1: OVERVIEW (Original Dashboard Layout with heatmaps hovers) ───── */}
        {activeTab === "overview" && (
          <div className="space-y-6">
            
            {/* Top row: 3 original Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              
              {/* Card 1: Today's Goal */}
              <div className="bg-muted/15 border border-border/40 p-4 rounded-xl flex items-center justify-between gap-4 shadow-sm hover:border-border/80 transition-all duration-200">
                <div className="flex-1 min-w-0">
                  <span className="text-[9px] uppercase font-bold tracking-wider text-muted-foreground flex items-center gap-1">
                    <Target size={10} className="text-muted-foreground/60" /> Daily Target
                  </span>
                  <div className="text-lg font-black text-foreground mt-1 tabular-nums">
                    <AnimatedNumber value={todayMinutes} /> / {dailyStudyGoal} mins
                  </div>
                  <p className="text-[10px] mt-1.5 font-medium leading-relaxed">
                    {todayMinutes >= dailyStudyGoal ? (
                      <span className="text-emerald-500 font-semibold flex items-center gap-0.5">
                        🎉 Goal completed today!
                      </span>
                    ) : (
                      <span className="text-amber-500 font-semibold">
                        ⏳ {dailyStudyGoal - todayMinutes} mins left to maintain streak
                      </span>
                    )}
                  </p>
                </div>
                
                {/* SVG Progress Ring */}
                <div className="relative flex items-center justify-center flex-shrink-0">
                  <svg className="w-12 h-12 transform -rotate-90">
                    <circle
                      cx="24"
                      cy="24"
                      r={radius}
                      className="stroke-muted/30"
                      strokeWidth="3.5"
                      fill="transparent"
                    />
                    <circle
                      cx="24"
                      cy="24"
                      r={radius}
                      className="stroke-primary transition-all duration-700 ease-out"
                      strokeWidth="4"
                      strokeDasharray={circumference}
                      strokeDashoffset={strokeDashoffset}
                      strokeLinecap="round"
                      fill="transparent"
                    />
                  </svg>
                  <div className="absolute text-[10px] font-black text-foreground tabular-nums">
                    {goalProgress}%
                  </div>
                </div>
              </div>

              {/* Card 2: Streak */}
              <div className="bg-muted/15 border border-border/40 p-4 rounded-xl flex items-center justify-between gap-4 shadow-sm hover:border-border/80 transition-all duration-200">
                <div className="min-w-0">
                  <span className="text-[9px] uppercase font-bold tracking-wider text-muted-foreground flex items-center gap-1">
                    <Flame size={10} className="text-amber-500" /> Active Streak
                  </span>
                  <div className="text-2xl font-black text-amber-500 mt-1 flex items-center gap-1.5 tabular-nums">
                    🔥 <AnimatedNumber value={streak.current} /> <span className="text-xs font-semibold text-muted-foreground">days</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-2 font-medium">
                    Personal best streak: <span className="font-bold text-foreground tabular-nums">{streak.best} days</span>
                  </p>
                </div>
                <div className="w-10 h-10 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-500 flex items-center justify-center flex-shrink-0">
                  <Flame size={20} fill="currentColor" className="animate-pulse" />
                </div>
              </div>

              {/* Card 3: Library Coverage */}
              <div className="bg-muted/15 border border-border/40 p-4 rounded-xl flex items-center justify-between gap-4 shadow-sm hover:border-border/80 transition-all duration-200">
                <div className="min-w-0">
                  <span className="text-[9px] uppercase font-bold tracking-wider text-muted-foreground flex items-center gap-1">
                    <BookOpen size={10} className="text-muted-foreground/60" /> Library Coverage
                  </span>
                  <div className="text-lg font-black text-foreground mt-1 tabular-nums">
                    <AnimatedNumber value={totalCoveredMinutes} formatter={formatMinsToDuration} />
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-2.5 font-medium">
                    Lectures completed: <span className="font-extrabold text-foreground tabular-nums"><AnimatedNumber value={studyStats?.completed_lectures_count || 0} /></span>
                  </p>
                </div>
                <div className="w-10 h-10 rounded-lg bg-primary/10 border border-primary/20 text-primary flex items-center justify-center flex-shrink-0">
                  <BookOpen size={18} />
                </div>
              </div>

            </div>

            {/* Heatmap Area with original hovering tooltip details */}
            <div className="border border-border/40 p-4 bg-muted/5 rounded-xl">
              <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 mb-4">
                <div className="flex-1">
                  <h4 className="text-[10px] font-bold text-foreground uppercase tracking-wider flex items-center gap-1">
                    <Calendar size={11} className="text-muted-foreground" /> Annual Study Heatmap
                  </h4>
                  <p className="text-[9px] text-muted-foreground mt-1 leading-relaxed max-w-sm">
                    Shading indicates daily study duration (total real-world minutes). Hover over any square to see logged study time.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="text-[10px] text-foreground font-semibold">
                    Total Focus Time: <span className="text-primary tabular-nums"><AnimatedNumber value={totalStudyMinutes} formatter={formatMinsToDuration} /></span>
                  </div>
                  <select
                    value={selectedYear}
                    onChange={(e) => setSelectedYear(e.target.value)}
                    className="text-[9px] font-bold bg-muted/40 hover:bg-muted/65 border border-border/40 rounded px-1.5 py-0.5 text-foreground cursor-pointer focus:outline-none transition-all"
                  >
                    <option value="last_year" className="bg-background text-foreground text-[10px]">This Year</option>
                    {logYears.map(yr => (
                      <option key={yr} value={String(yr)} className="bg-background text-foreground text-[10px]">{yr}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Heatmap Grid Layout */}
              <div className="flex items-start gap-2 overflow-x-auto pb-2 relative">
                <div className="flex flex-col justify-between text-[7px] font-bold text-muted-foreground/60 h-[102px] pr-1 leading-none py-1 select-none">
                  <span>Sun</span>
                  <span>Tue</span>
                  <span>Thu</span>
                  <span>Sat</span>
                </div>

                <div className="flex flex-col">
                  <div className="grid grid-flow-col grid-rows-7 gap-1 p-1.5 bg-muted/20 border border-border/40 rounded-lg">
                    {heatmapDates.map((date) => {
                      const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
                      const seconds = studyStats?.daily_logs?.[dateStr] || 0;
                      const mins = Math.round(seconds / 60);
                      const maxMins = 60;
                      const opacityVal = mins > 0 ? Math.min(1.0, Math.max(0.15, mins / maxMins)) : 0;
                      
                      const formattedDate = date.toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      });
                      
                      const todayObj = new Date();
                      todayObj.setHours(23, 59, 59, 999);
                      let isHidden = selectedYear === "last_year" 
                        ? date > todayObj 
                        : date.getFullYear() !== parseInt(selectedYear, 10);
                      
                      if (isHidden) {
                        return <div key={dateStr} className="w-[11px] h-[11px] rounded-[2px] opacity-0 pointer-events-none" />;
                      }
                      
                      const isHovered = hoveredDate === dateStr;
                      return (
                        <div
                          key={dateStr}
                          onMouseEnter={(e) => {
                            const rect = e.currentTarget.getBoundingClientRect();
                            setHoveredDate(dateStr);
                            setHoveredDay({
                              formattedDate,
                              mins,
                              x: rect.left + rect.width / 2,
                              y: rect.top - 8,
                            });
                          }}
                          onMouseLeave={() => {
                            setHoveredDate(null);
                            setHoveredDay(null);
                          }}
                          onClick={() => handleHeatmapCellClick(dateStr)}
                          className={`w-[11px] h-[11px] rounded-[2px] transition-all duration-200 cursor-pointer ${
                            mins > 0 
                              ? "bg-primary border border-primary/20 shadow-sm" 
                              : "bg-muted/40 border border-border/20"
                          }`}
                          style={
                            mins > 0 
                              ? { 
                                  opacity: isHovered ? 1.0 : opacityVal,
                                  transform: isHovered ? "scale(1.3)" : "scale(1)",
                                  zIndex: isHovered ? 10 : 1
                                } 
                              : {
                                  transform: isHovered ? "scale(1.3)" : "scale(1)",
                                  zIndex: isHovered ? 10 : 1,
                                  backgroundColor: isHovered ? "hsl(var(--muted-foreground))" : undefined,
                                  opacity: isHovered ? 0.6 : undefined
                                }
                          }
                        />
                      );
                    })}
                  </div>
                  {/* Month labels below heatmap */}
                  <div 
                    className="grid grid-flow-col gap-1 pl-1.5 pr-1.5 text-[7px] font-bold text-muted-foreground/60 select-none mt-1"
                    style={{ gridTemplateColumns: `repeat(${weekCount}, 11px)` }}
                  >
                    {monthLabels.map((lbl, idx) => (
                      <span 
                        key={idx} 
                        style={{ gridColumnStart: lbl.colIndex + 1 }}
                        className="col-span-4 truncate text-left"
                      >
                        {lbl.name}
                      </span>
                    ))}
                  </div>
                </div>
                
                {/* Heatmap Legend */}
                <div className="flex flex-col justify-between text-[8px] font-bold text-muted-foreground/75 h-[100px] pl-2 border-l border-border/40 py-2 select-none shrink-0">
                  <span className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-[2px] bg-muted/40 border border-border/20" /> Less
                  </span>
                  <span className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-[2px] bg-primary border border-primary/20 opacity-30" /> 1-15m
                  </span>
                  <span className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-[2px] bg-primary border border-primary/20 opacity-65" /> 15-45m
                  </span>
                  <span className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-[2px] bg-primary border border-primary/20 opacity-100" /> 45m+
                  </span>
                </div>
              </div>
            </div>

          </div>
        )}

        {/* ───── TAB 2: COURSE STATS ───── */}
        {activeTab === "courses" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-border/40 pb-2">
              <div>
                <h4 className="text-[10px] font-bold text-foreground uppercase tracking-wider flex items-center gap-1">
                  <Award size={11} className="text-primary" /> Study Time by Course
                </h4>
                <p className="text-[9px] text-muted-foreground mt-0.5">Top-ranked playlists by watch hours and progress metrics.</p>
              </div>
            </div>

            {courseTimeDetails.length === 0 ? (
              <div className="py-12 border border-dashed border-border/40 rounded-xl flex flex-col justify-center items-center text-center p-8">
                <BookOpen size={24} className="text-muted-foreground/35 mb-2" />
                <h5 className="text-[11px] font-bold text-foreground">No course statistics available</h5>
                <p className="text-[9px] text-muted-foreground max-w-xs mt-1 leading-relaxed">
                  Import YouTube playlist courses or watch loaded lectures to gather study stats here.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {courseTimeDetails.map((course) => {
                  const watchMins = Math.floor((course.total_study_time || 0) / 60);
                  const completionPct = course.total_videos > 0 
                    ? Math.round((course.completed_videos / course.total_videos) * 100) 
                    : 0;

                  return (
                    <div 
                      key={course.playlist_id}
                      onClick={() => {
                        const playlistObj = playlists.find(p => p.id === course.playlist_id);
                        if (playlistObj && onSelectPlaylist) {
                          onSelectPlaylist(playlistObj);
                        }
                      }}
                      className="flex gap-3 bg-muted/15 border border-border/45 hover:border-border/80 hover:bg-muted/20 p-3.5 rounded-xl shadow-sm hover:shadow transition-all duration-200 relative group overflow-hidden cursor-pointer"
                    >
                      {/* Image Thumbnail */}
                      <div className="w-14 h-14 rounded-lg overflow-hidden shrink-0 border border-border/30 bg-gradient-to-br from-primary/10 to-primary/30 flex items-center justify-center relative">
                        {course.thumbnail_url ? (
                          <img 
                            src={course.thumbnail_url} 
                            alt={course.playlist_title} 
                            className="w-full h-full object-cover"
                            onError={(e) => { e.currentTarget.style.display = 'none'; }}
                          />
                        ) : (
                          <BookOpen size={18} className="text-primary/75" />
                        )}
                      </div>

                      {/* Course Details */}
                      <div className="min-w-0 flex-grow flex flex-col justify-between">
                        <div>
                          <h5 className="text-[11px] font-extrabold text-foreground truncate leading-tight group-hover:text-primary transition-colors">
                            {course.playlist_title}
                          </h5>
                          <div className="flex gap-2 text-[9px] text-muted-foreground mt-1">
                            <span className="font-semibold text-foreground">
                              {watchMins > 0 ? formatMinsToDuration(watchMins) : "0m"} studied
                            </span>
                            <span>•</span>
                            <span>{course.completed_videos}/{course.total_videos} completed</span>
                          </div>
                        </div>

                        {/* Progress bar */}
                        <div className="mt-2.5">
                          <div className="flex items-center justify-between text-[8px] font-bold text-muted-foreground mb-1 select-none">
                            <span>Progress</span>
                            <span className="text-foreground">{completionPct}%</span>
                          </div>
                          <div className="w-full h-1.5 bg-muted/70 rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-primary rounded-full transition-all duration-500"
                              style={{ width: `${completionPct}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ───── TAB 3: DAILY ACTIVITY DETAILED (WEEKLY BAR CHART & TRACKER) ───── */}
        {activeTab === "daily_activity" && (() => {
          const maxDailySecs = Math.max(...weekData.map(d => d.details?.total_seconds || 0));
          const scaleMax = maxDailySecs > 0 ? maxDailySecs : 3600;

          const selectedDayItem = weekData[selectedDayIndex];
          
          // Compile selected day data
          const hourlyMap = Array(24).fill(0);
          if (selectedDayItem?.details?.hourly_activity) {
            selectedDayItem.details.hourly_activity.forEach(item => {
              if (item.hour >= 0 && item.hour < 24) {
                hourlyMap[item.hour] = item.duration_seconds;
              }
            });
          }
          const maxHourVal = Math.max(...hourlyMap);
          const maxHourSecs = maxHourVal > 0 ? maxHourVal : 600;
          const maxVideoSeconds = selectedDayItem?.details?.video_details?.[0]?.duration_seconds || 1;

          return (
            <div className="space-y-5">
              
              {/* Calendar Week range header selector */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/40 pb-4">
                <div>
                  <h4 className="text-xs font-bold text-foreground uppercase tracking-wider flex items-center gap-1.5">
                    <Clock size={14} className="text-primary" /> Daily Activity & Usage Tracker
                  </h4>
                  <p className="text-[10px] text-muted-foreground mt-0.5">Compare daily focus stats over a week. Select any day column to expand details.</p>
                </div>
                <div className="flex items-center gap-2 relative">
                  <span className="text-[10px] font-bold text-muted-foreground">Week ending on:</span>
                  <div className="relative">
                    <button
                      onClick={() => setIsCalendarOpen(!isCalendarOpen)}
                      className="flex items-center gap-2 text-[10px] font-bold bg-muted/40 hover:bg-muted/65 border border-border/40 hover:border-border/80 rounded px-2.5 py-1.5 text-foreground cursor-pointer focus:outline-none transition-all outline-none"
                    >
                      <Calendar size={12} className="text-primary" />
                      <span>{new Date(weekEndDate + "T00:00:00").toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                    </button>

                    {isCalendarOpen && (
                      <>
                        <div 
                          className="fixed inset-0 z-[9998]"
                          onClick={() => setIsCalendarOpen(false)}
                        />
                        <div className="absolute right-0 mt-2 p-3 bg-popover text-popover-foreground border border-border rounded-xl shadow-lg z-[9999] w-56 select-none animate-in fade-in slide-in-from-top-1 duration-150">
                          {/* Calendar Header */}
                          <div className="flex items-center justify-between mb-2 pb-1.5 border-b border-border/40">
                            <button 
                              onClick={() => handleCalendarMonthChange(-1)}
                              className="p-1 rounded hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                            >
                              <ChevronLeft size={12} />
                            </button>
                            <span className="text-[10px] font-bold tracking-wide">
                              {new Date(calendarYear, calendarMonth).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
                            </span>
                            <button 
                              onClick={() => handleCalendarMonthChange(1)}
                              className="p-1 rounded hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                            >
                              <ChevronRight size={12} />
                            </button>
                          </div>

                          {/* Weekday headers */}
                          <div className="grid grid-cols-7 gap-1 text-center text-[7px] font-extrabold text-muted-foreground uppercase mb-1">
                            {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map(d => (
                              <span key={d}>{d}</span>
                            ))}
                          </div>

                          {/* Days Grid */}
                          <div className="grid grid-cols-7 gap-1">
                            {generateCalendarDays()}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Weekly Bar Chart */}
              <div className="border border-border/40 bg-muted/5 p-4 rounded-xl shadow-sm">
                <div className="flex justify-between items-center mb-3">
                  <span className="text-[9px] font-extrabold uppercase tracking-wider text-muted-foreground">
                    Weekly Focus Summary
                  </span>
                  <span className="text-[10px] font-extrabold text-foreground bg-primary/10 border border-primary/20 px-2 py-0.5 rounded">
                    Total: {formatSecondsToDuration(weekData.reduce((acc, curr) => acc + (curr.details?.total_seconds || 0), 0))}
                  </span>
                </div>

                {isWeekLoading ? (
                  <div className="h-28 flex flex-col justify-center items-center gap-1.5 text-muted-foreground">
                    <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    <span className="text-[9px] font-bold">Loading weekly activity...</span>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    {/* Y-axis Labels */}
                    <div className="flex flex-col justify-between text-[7px] font-bold text-muted-foreground/60 h-20 w-8 select-none text-right pr-1 pb-1">
                      <span>{formatSecondsToShortDuration(scaleMax)}</span>
                      <span>{formatSecondsToShortDuration(scaleMax / 2)}</span>
                      <span>0m</span>
                    </div>

                    {/* Columns Container with gridlines */}
                    <div className="flex-1 relative h-20">
                      {/* Grid Lines */}
                      <div className="absolute inset-y-0 inset-x-0 flex flex-col justify-between pointer-events-none select-none z-0">
                        <div className="w-full border-t border-border/20 border-dashed" />
                        <div className="w-full border-t border-border/20 border-dashed" />
                        <div className="w-full border-b border-border/25" />
                      </div>

                      {/* Bars */}
                      <div className="absolute inset-0 flex items-end justify-between gap-1.5 z-10">
                        {weekData.map((dayItem, idx) => {
                          const isSelected = selectedDayIndex === idx;
                          const totalSecs = dayItem.details?.total_seconds || 0;
                          const barHeightPct = (totalSecs / scaleMax) * 100;
                          const dateObj = new Date(dayItem.date + "T00:00:00");
                          const isToday = dayItem.date === todayStr;

                          return (
                            <div 
                              key={dayItem.date}
                              onClick={() => setSelectedDayIndex(idx)}
                              className="flex-1 flex flex-col items-center group cursor-pointer h-full justify-end"
                            >
                              <div className="w-full relative flex flex-col items-center justify-end h-full">
                                {/* Tooltip on Hover */}
                                <div className="absolute -top-10 bg-zinc-950 border border-zinc-800 text-zinc-50 text-[9px] px-2 py-1 rounded shadow-md opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-200 z-[999] whitespace-nowrap text-center">
                                  <div className="font-extrabold">{dateObj.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</div>
                                  <div>{formatSecondsToDuration(totalSecs)} focus</div>
                                  <div className="absolute left-1/2 bottom-0 w-1.5 h-1.5 bg-zinc-950 border-r border-b border-zinc-800 transform -translate-x-1/2 translate-y-1/2 rotate-45" />
                                </div>

                                {/* Column Bar */}
                                <div 
                                  className={`w-full rounded-t-[3px] transition-all duration-300 ${
                                    isSelected 
                                      ? "bg-gradient-to-t from-primary/70 to-primary group-hover:brightness-110" 
                                      : isToday
                                        ? "bg-gradient-to-t from-primary/30 to-primary/50 group-hover:brightness-110"
                                        : "bg-gradient-to-t from-muted-foreground/15 to-muted-foreground/30 group-hover:brightness-110"
                                  }`}
                                  style={{ 
                                    height: `${Math.max(0, barHeightPct)}%`,
                                    transition: "height 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
                                    filter: isSelected ? "drop-shadow(0 0 3px hsl(var(--primary) / 0.4))" : undefined
                                  }}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}

                {/* Day Labels aligned below bars */}
                {!isWeekLoading && (
                  <div className="flex gap-2 mt-1.5">
                    {/* Placeholder matching Y-axis spacing */}
                    <div className="w-8 shrink-0" />
                    
                    <div className="flex-1 flex justify-between gap-1.5 select-none leading-tight">
                      {weekData.map((dayItem, idx) => {
                        const isSelected = selectedDayIndex === idx;
                        const dateObj = new Date(dayItem.date + "T00:00:00");
                        const dayName = dateObj.toLocaleDateString(undefined, { weekday: 'short' });
                        const dayNum = dateObj.getDate();

                        return (
                          <div 
                            key={dayItem.date} 
                            onClick={() => setSelectedDayIndex(idx)}
                            className="flex-grow flex-1 text-center cursor-pointer"
                          >
                            <div className={`text-[9px] font-extrabold ${isSelected ? "text-primary" : "text-muted-foreground"}`}>
                              {dayName}
                            </div>
                            <div className={`text-[8px] font-medium mt-0.5 ${isSelected ? "text-foreground font-extrabold" : "text-muted-foreground/75"}`}>
                              {dayNum}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Selected Day Details Section */}
              {selectedDayItem && (
                <div className="border border-border/40 bg-card p-4 rounded-xl shadow-sm space-y-4">
                  {/* Selected Day Header */}
                  <div className="flex items-center justify-between border-b border-border/40 pb-3">
                    <div className="flex items-center gap-2">
                      <Calendar size={14} className="text-primary" />
                      <span className="text-xs font-bold text-foreground">
                        {selectedDayItem.date === todayStr ? `Today (${formatFriendlyDate(selectedDayItem.date)})` : formatFriendlyDate(selectedDayItem.date)}
                      </span>
                    </div>
                    {selectedDayItem.details?.total_seconds > 0 ? (
                      <span className="text-[10px] font-extrabold text-foreground bg-primary/10 border border-primary/20 px-2 py-0.5 rounded">
                        {formatSecondsToDuration(selectedDayItem.details.total_seconds)} focus
                      </span>
                    ) : (
                      <span className="text-[9px] font-medium text-muted-foreground bg-muted/40 px-2 py-0.5 rounded">
                        No study logs
                      </span>
                    )}
                  </div>

                  {/* Selected Day Data Graphs */}
                  {selectedDayItem.loading ? (
                    <div className="py-10 flex flex-col justify-center items-center gap-1.5 text-muted-foreground">
                      <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                      <span className="text-[9px] font-bold">Retrieving daily logs...</span>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
                      
                      {/* Graph 1: Hourly Distribution (vertical bar chart) (7 cols) */}
                      <div className="lg:col-span-7 space-y-3">
                        <h5 className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1 select-none">
                          <BarChart2 size={10} /> Graph 1: Hourly Focus Distribution
                        </h5>
                        <div className="relative border border-border/30 bg-card p-3 rounded-lg shadow-sm">
                          <div className="flex gap-2">
                            {/* Y-axis Labels */}
                            <div className="flex flex-col justify-between text-[7px] font-bold text-muted-foreground/60 h-[90px] w-8 select-none text-right pr-1 pb-1">
                              <span>{formatSecondsToShortDuration(maxHourSecs)}</span>
                              <span>{formatSecondsToShortDuration(maxHourSecs / 2)}</span>
                              <span>0m</span>
                            </div>

                            {/* Columns Container with gridlines */}
                            <div className="flex-1 relative h-[90px]">
                              {/* Grid Lines */}
                              <div className="absolute inset-y-0 inset-x-0 flex flex-col justify-between pointer-events-none select-none z-0">
                                <div className="w-full border-t border-border/10 border-dashed" />
                                <div className="w-full border-t border-border/10 border-dashed" />
                                <div className="w-full border-b border-border/15" />
                              </div>

                              {/* Bars */}
                              <div className="absolute inset-0 flex items-end justify-between z-10">
                                {hourlyMap.map((seconds, hr) => {
                                  const heightPct = (seconds / maxHourSecs) * 100;
                                  const hasData = seconds > 0;
                                  const isHourHovered = hoveredHour === `${selectedDayItem.date}-${hr}`;
                                  const formattedHour = hr === 0 ? "12 AM" : hr === 12 ? "12 PM" : hr > 12 ? `${hr - 12} PM` : `${hr} AM`;

                                  return (
                                    <div 
                                      key={hr}
                                      onMouseEnter={() => setHoveredHour(`${selectedDayItem.date}-${hr}`)}
                                      onMouseLeave={() => setHoveredHour(null)}
                                      className="flex-grow flex-1 flex flex-col items-center group cursor-pointer h-full justify-end px-[1px]"
                                    >
                                      {/* Hover Tooltip */}
                                      {isHourHovered && hasData && (
                                        <div className="absolute -top-10 bg-zinc-950 border border-zinc-800 text-zinc-50 text-[9px] px-2 py-1 rounded shadow-md z-[999] pointer-events-none text-center">
                                          <div className="font-extrabold">{formattedHour}</div>
                                          <div>{formatSecondsToDuration(seconds)}</div>
                                          <div className="absolute left-1/2 bottom-0 w-1.5 h-1.5 bg-zinc-950 border-r border-b border-zinc-800 transform -translate-x-1/2 translate-y-1/2 rotate-45" />
                                        </div>
                                      )}
                                      
                                      <div 
                                        className={`w-full rounded-t-[1.5px] transition-all duration-300 ${
                                          hasData 
                                            ? "bg-gradient-to-t from-primary/70 to-primary group-hover:brightness-110" 
                                            : "bg-muted/30"
                                        }`}
                                        style={{ 
                                          height: hasData ? `${Math.max(6, heightPct)}%` : "4%",
                                          transition: "height 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
                                          filter: isHourHovered && hasData ? "drop-shadow(0 0 3px hsl(var(--primary) / 0.4))" : undefined
                                        }}
                                      />
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                          
                          {/* Label indicators aligned below bars */}
                          <div className="flex gap-2 mt-2 px-1 border-t border-border/10 pt-1 leading-none">
                            <div className="w-8 shrink-0" />
                            <div className="flex-1 flex justify-between text-[7px] font-bold text-muted-foreground/60 select-none">
                              <span>12 AM</span>
                              <span>6 AM</span>
                              <span>12 PM</span>
                              <span>6 PM</span>
                              <span>11 PM</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Graph 2: Video study breakdown (horizontal bar chart) (5 cols) */}
                      <div className="lg:col-span-5 space-y-3">
                        <h5 className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1 select-none">
                          <History size={10} /> Graph 2: Lecture Video Breakdown
                        </h5>
                        <div className="space-y-2.5 max-h-44 overflow-y-auto pr-1">
                          {!selectedDayItem.details?.video_details || selectedDayItem.details.video_details.length === 0 ? (
                            <div className="py-8 border border-dashed border-border/30 rounded-lg flex flex-col justify-center items-center text-center p-4">
                              <Video size={16} className="text-muted-foreground/35 mb-1.5" />
                              <span className="text-[10px] font-bold text-muted-foreground">No Video Breakdown</span>
                              <p className="text-[8px] text-muted-foreground/75 mt-0.5">No video study logs recorded on this day.</p>
                            </div>
                          ) : (
                            selectedDayItem.details.video_details.map(log => {
                              const barWeightPct = maxVideoSeconds > 0 ? (log.duration_seconds / maxVideoSeconds) * 100 : 0;
                              
                              return (
                                <div 
                                  key={log.video_id}
                                  className="group bg-card border border-border/30 hover:border-border p-2 rounded-lg transition-all duration-200"
                                >
                                  <div className="flex items-start justify-between gap-2.5 mb-1">
                                    <div className="min-w-0 flex-1">
                                      <button
                                        onClick={() => onPlayBookmarkVideo && onPlayBookmarkVideo(log.playlist_id, log.video_id, 0)}
                                        className="text-[9px] font-extrabold text-foreground group-hover:text-primary transition-colors text-left truncate block w-full hover:underline"
                                        title="Click to resume watch"
                                      >
                                        🎥 {log.video_title}
                                      </button>
                                      <div className="text-[8px] text-muted-foreground leading-none mt-0.5 truncate max-w-full">
                                        {log.playlist_title}
                                      </div>
                                    </div>
                                    <span className="text-[8px] font-extrabold text-foreground shrink-0 bg-muted/40 px-1 py-0.5 rounded border border-border/30">
                                      {formatSecondsToDuration(log.duration_seconds)}
                                    </span>
                                  </div>
                                  
                                  {/* Horizontal progress bar representing duration rank */}
                                  <div className="w-full h-1 bg-muted/50 rounded-full overflow-hidden">
                                    <div 
                                      className="h-full bg-primary rounded-full transition-all duration-300"
                                      style={{ width: `${barWeightPct}%` }}
                                    />
                                  </div>
                                </div>
                              );
                            })
                          )}
                        </div>
                      </div>

                    </div>
                  )}
                </div>
              )}

            </div>
          );
        })()}

      </div>

      {/* Floating Heatmap Tooltip */}
      {hoveredDay && createPortal(
        <div 
          className="fixed z-[9999] px-2.5 py-1.5 text-[10px] font-medium text-zinc-100 bg-zinc-950 border border-zinc-800 rounded shadow-md pointer-events-none transform -translate-x-1/2 -translate-y-full animate-in fade-in duration-100"
          style={{
            left: hoveredDay.x,
            top: hoveredDay.y,
          }}
        >
          <div className="relative leading-none">
            {hoveredDay.mins > 0 ? (
              <span>
                <strong className="text-zinc-50 font-extrabold">{hoveredDay.mins} mins</strong> on {hoveredDay.formattedDate}
              </span>
            ) : (
              <span>No study time on {hoveredDay.formattedDate}</span>
            )}
            <div className="absolute left-1/2 -bottom-[10.5px] w-1.5 h-1.5 bg-zinc-950 border-r border-b border-zinc-800 transform -translate-x-1/2 rotate-45" />
          </div>
        </div>,
        document.body
      )}
      </div>
    </>
  );
}
