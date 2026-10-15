import React, { useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer
} from 'recharts';

export default function AnalyticsDashboard({ data, computeScores }) {

  // 1. Data Aggregation & Prep
  const { kpis, stackedData, scatterData, radarData, deptAverages } = useMemo(() => {
    if (!data || data.length === 0) {
      return { kpis: {}, stackedData: [], scatterData: [], radarData: [], deptAverages: {} };
    }

    let totalScoreSum = 0;
    let maxScore = 0;
    let topPerformer = 'N/A';
    const deptMap = {};

    const processed = data.map(row => {
      const fullScores = computeScores(row.sectionData || row, 'Faculty');
      // Replicate the table's total score logic
      const totalScore = typeof fullScores.grandTotal === 'number'
        ? fullScores.grandTotal
        : (row.totalScore || row.convertedScore || (fullScores.total || 0) + (fullScores.section2Total || 0));
      const dept = (row.department || row.dept || 'CSE').toUpperCase().trim();

      // Extract breakdown (approximate mapping based on typical academic sections)
      const teaching = (fullScores.section1Total || fullScores.total || 0);
      const research = (fullScores.section2Total || 0);
      const admin = (fullScores.section3Total || 0);
      const other = (fullScores.section4Total || 0) + (fullScores.section5Total || 0) + (fullScores.section6Total || 0);

      if (totalScore > maxScore) {
        maxScore = totalScore;
        topPerformer = row.facultyName || 'Unknown';
      }
      totalScoreSum += totalScore;

      // Track Department-wise stats for Registrar / Principal breakdown
      if (!deptMap[dept]) {
        deptMap[dept] = { count: 0, sum: 0, topFaculty: row.facultyName || 'Unknown', topScore: totalScore, deptName: dept };
      }
      deptMap[dept].count += 1;
      deptMap[dept].sum += totalScore;
      if (totalScore > deptMap[dept].topScore) {
        deptMap[dept].topScore = totalScore;
        deptMap[dept].topFaculty = row.facultyName || 'Unknown';
      }

      return {
        id: row.id || row._id,
        name: row.facultyName || 'Unknown',
        department: dept,
        total: totalScore,
        Teaching: teaching,
        Research: research,
        Admin: admin,
        Other: other,
      };
    });

    // Sort for Leaderboard (top 10)
    const sortedDesc = [...processed].sort((a, b) => b.total - a.total);
    const stacked = sortedDesc.slice(0, 10);

    // Department Stats List for KPI Popover Cards
    const deptStatsList = Object.values(deptMap).map(d => ({
      dept: d.deptName,
      count: d.count,
      avg: (d.sum / d.count).toFixed(1),
      topFaculty: d.topFaculty,
      topScore: d.topScore.toFixed(1)
    })).sort((a, b) => Number(b.topScore) - Number(a.topScore));

    const kpiSummary = {
      totalSubmissions: processed.length,
      averageScore: (totalScoreSum / processed.length).toFixed(1),
      topPerformer: `${topPerformer} (${maxScore.toFixed(1)} pts)`,
      deptStatsList
    };

    return { 
      kpis: kpiSummary, 
      stackedData: stacked, 
      deptAverages: deptMap 
    };
  }, [data, computeScores]);

  // Custom Tooltip for Stacked Bar
  const CustomBarTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      const total = payload.reduce((sum, entry) => sum + entry.value, 0);
      return (
        <div className="bg-white border border-slate-200 p-3 shadow-lg rounded-lg shadow-black/10 min-w-[200px] z-50 relative">
          <p className="font-bold text-slate-800 mb-2 border-b border-slate-100 pb-1">{label}</p>
          {payload.map((entry, index) => (
            <div key={index} className="flex justify-between items-center text-xs my-1">
              <span className="flex items-center gap-1.5 text-slate-600">
                <span className="w-2.5 h-2.5 rounded-sm block" style={{ backgroundColor: entry.color }}></span>
                {entry.name}:
              </span>
              <span className="font-semibold text-slate-800">{entry.value.toFixed(1)}</span>
            </div>
          ))}
          <div className="flex justify-between items-center text-sm mt-2 pt-2 border-t border-slate-100 font-bold text-maroon-700">
            <span>Total Score:</span>
            <span>{total.toFixed(1)}</span>
          </div>
        </div>
      );
    }
    return null;
  };


  if (!data || data.length === 0) {
    return <div className="p-8 text-center text-slate-500 flex flex-col items-center justify-center min-h-[400px] bg-slate-50 rounded-xl border border-dashed border-slate-300">
      <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-slate-400 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
      <p className="text-sm font-medium">No submission data available for analytics.</p>
      <p className="text-xs mt-1">Wait for faculty to submit appraisals to see insights here.</p>
    </div>;
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500 ease-in-out">
      
      {/* KPI Cards with Hover Popover Insights */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

        {/* Card 1: Total Submissions */}
        <div className="group relative bg-white p-5 rounded-xl border border-slate-200 shadow-sm shadow-black/5 flex flex-col justify-center transition-all hover:shadow-md cursor-pointer">
          <div className="flex justify-between items-center">
            <p className="text-xs font-bold uppercase text-slate-400 tracking-wider">Total Submissions</p>
            <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full group-hover:bg-maroon-50 group-hover:text-maroon-700 transition">Hover Breakdown</span>
          </div>
          <p className="text-3xl font-black text-slate-800 mt-1">{kpis.totalSubmissions}</p>

          {/* Popover */}
          <div className="absolute top-full left-0 mt-2 w-72 bg-white rounded-xl shadow-xl border border-slate-200 p-4 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 pointer-events-none group-hover:pointer-events-auto">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-2 border-b border-slate-100 pb-1">Submissions by Department</p>
            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
              {kpis.deptStatsList?.map(d => (
                <div key={d.dept} className="flex justify-between items-center text-xs">
                  <span className="font-semibold text-slate-700">{d.dept}:</span>
                  <span className="font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded-md">{d.count} submission(s)</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Card 2: Department Average */}
        <div className="group relative bg-white p-5 rounded-xl border border-slate-200 shadow-sm shadow-black/5 flex flex-col justify-center transition-all hover:shadow-md cursor-pointer">
          <div className="flex justify-between items-center">
            <p className="text-xs font-bold uppercase text-slate-400 tracking-wider">Department Average</p>
            <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full group-hover:bg-maroon-50 group-hover:text-maroon-700 transition">Hover Breakdown</span>
          </div>
          <div className="flex items-baseline gap-1 mt-1">
            <p className="text-3xl font-black text-slate-800">{kpis.averageScore}</p>
            <p className="text-sm font-bold text-slate-400">pts</p>
          </div>

          {/* Popover */}
          <div className="absolute top-full left-0 mt-2 w-72 bg-white rounded-xl shadow-xl border border-slate-200 p-4 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 pointer-events-none group-hover:pointer-events-auto">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-2 border-b border-slate-100 pb-1">Average Score by Department</p>
            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
              {kpis.deptStatsList?.map(d => (
                <div key={d.dept} className="flex justify-between items-center text-xs">
                  <span className="font-semibold text-slate-700">{d.dept}:</span>
                  <span className="font-bold text-maroon-700 bg-maroon-50 px-2 py-0.5 rounded-md">{d.avg} pts</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Card 3: Highest Score */}
        <div className="group relative bg-white p-5 rounded-xl border border-slate-200 shadow-sm shadow-black/5 flex flex-col justify-center border-l-4 border-l-maroon-700 transition-all hover:shadow-md cursor-pointer">
          <div className="flex justify-between items-center">
            <p className="text-xs font-bold uppercase text-maroon-700 tracking-wider">Highest Score</p>
            <span className="text-[10px] font-bold text-maroon-700 bg-maroon-50 px-2 py-0.5 rounded-full">Top Performers</span>
          </div>
          <p className="text-xl font-black text-slate-800 mt-1 truncate" title={kpis.topPerformer}>{kpis.topPerformer}</p>

          {/* Popover */}
          <div className="absolute top-full right-0 mt-2 w-80 bg-white rounded-xl shadow-xl border border-slate-200 p-4 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 pointer-events-none group-hover:pointer-events-auto">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-2 border-b border-slate-100 pb-1">Top Performer by Department</p>
            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {kpis.deptStatsList?.map(d => (
                <div key={d.dept} className="p-2 bg-slate-50 rounded-lg border border-slate-100 text-xs">
                  <div className="flex justify-between items-center font-bold text-slate-800">
                    <span className="text-maroon-700">{d.dept}</span>
                    <span className="bg-white px-2 py-0.5 rounded border border-slate-200 text-slate-900">{d.topScore} pts</span>
                  </div>
                  <p className="text-[11px] text-slate-600 mt-0.5 truncate">{d.topFaculty}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

      </div>

      {/* Leaderboard Chart (Full Width) */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm shadow-black/5 transition-all hover:shadow-md">
        <h3 className="text-sm font-bold uppercase tracking-wide text-gray-800 mb-6">Top 10 Performers (Contribution Breakdown)</h3>
        <div className="h-[350px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={stackedData} layout="vertical" margin={{ top: 5, right: 30, left: 40, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
              <XAxis type="number" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
              <YAxis dataKey="name" type="category" width={100} tick={{ fontSize: 12, fill: '#334155', fontWeight: 600 }} axisLine={false} tickLine={false} />
              <RechartsTooltip content={<CustomBarTooltip />} cursor={{fill: '#f8fafc', opacity: 0.6}} />
              <Legend iconType="circle" wrapperStyle={{ fontSize: '12px', paddingTop: '15px' }} />
              <Bar dataKey="Teaching" stackId="a" fill="#800000" animationDuration={1200} radius={[0, 0, 0, 0]} />
              <Bar dataKey="Research" stackId="a" fill="#475569" animationDuration={1200} />
              <Bar dataKey="Admin" stackId="a" fill="#d97706" animationDuration={1200} />
              <Bar dataKey="Other" stackId="a" fill="#94a3b8" animationDuration={1200} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
