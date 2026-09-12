import React, { useState, useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer,
  Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ScatterChart, Scatter, ZAxis, Label
} from 'recharts';

export default function AnalyticsDashboard({ data, computeScores }) {
  const [selectedFacultyId, setSelectedFacultyId] = useState(null);

  // 1. Data Aggregation & Prep
  const { kpis, stackedData, scatterData, radarData, deptAverages } = useMemo(() => {
    if (!data || data.length === 0) {
      return { kpis: {}, stackedData: [], scatterData: [], radarData: [], deptAverages: {} };
    }

    let totalScoreSum = 0;
    let maxScore = 0;
    let topPerformer = 'N/A';

    const processed = data.map(row => {
      const fullScores = computeScores(row.sectionData || row, 'Faculty');
      // Replicate the table's total score logic
      const totalScore = row.convertedScore || fullScores.grandTotal || (fullScores.total || 0) + (fullScores.section2Total || 0);
      
      // Extract breakdown (approximate mapping based on typical academic sections)
      // Section 1: Teaching, Section 2: Research, Section 3: Admin, Section 4: Consultancy/Other
      const teaching = (fullScores.section1Total || fullScores.total || 0);
      const research = (fullScores.section2Total || 0);
      const admin = (fullScores.section3Total || 0);
      const other = (fullScores.section4Total || 0) + (fullScores.section5Total || 0) + (fullScores.section6Total || 0);

      if (totalScore > maxScore) {
        maxScore = totalScore;
        topPerformer = row.facultyName || 'Unknown';
      }
      totalScoreSum += totalScore;

      return {
        id: row.id || row._id,
        name: row.facultyName || 'Unknown',
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

    // Scatter Data
    const scatter = processed.map(p => ({
      name: p.name,
      x: p.Teaching, // X-Axis
      y: p.Research  // Y-Axis
    }));

    // Department Averages for Radar
    const deptAvg = {
      Teaching: processed.reduce((sum, p) => sum + p.Teaching, 0) / processed.length || 0,
      Research: processed.reduce((sum, p) => sum + p.Research, 0) / processed.length || 0,
      Admin: processed.reduce((sum, p) => sum + p.Admin, 0) / processed.length || 0,
      Other: processed.reduce((sum, p) => sum + p.Other, 0) / processed.length || 0,
    };

    const radar = processed.map(p => ({
      ...p,
      avgTeaching: deptAvg.Teaching,
      avgResearch: deptAvg.Research,
      avgAdmin: deptAvg.Admin,
      avgOther: deptAvg.Other
    }));

    const kpiSummary = {
      totalSubmissions: processed.length,
      averageScore: (totalScoreSum / processed.length).toFixed(1),
      topPerformer: `${topPerformer} (${maxScore.toFixed(1)} pts)`,
    };

    return { 
      kpis: kpiSummary, 
      stackedData: stacked, 
      scatterData: scatter, 
      radarData: radar, 
      deptAverages: deptAvg 
    };
  }, [data, computeScores]);

  // Handle Radar Selection
  const selectedFacultyRadarData = useMemo(() => {
    if (!selectedFacultyId && radarData.length > 0) {
      // Default to the first faculty if none selected
      setSelectedFacultyId(radarData[0].id);
      return [];
    }
    const faculty = radarData.find(r => r.id === selectedFacultyId);
    if (!faculty) return [];
    
    // Format for Recharts Radar
    return [
      { subject: 'Teaching', Faculty: faculty.Teaching, Department: faculty.avgTeaching, fullMark: 100 },
      { subject: 'Research', Faculty: faculty.Research, Department: faculty.avgResearch, fullMark: 100 },
      { subject: 'Administration', Faculty: faculty.Admin, Department: faculty.avgAdmin, fullMark: 50 },
      { subject: 'Other/Consultancy', Faculty: faculty.Other, Department: faculty.avgOther, fullMark: 50 }
    ];
  }, [selectedFacultyId, radarData]);

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

  // Custom Tooltip for Scatter
  const CustomScatterTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-white border border-slate-200 p-3 shadow-lg rounded-lg shadow-black/10 z-50 relative">
          <p className="font-bold text-slate-800 border-b border-slate-100 pb-1 mb-2">{data.name}</p>
          <div className="flex justify-between gap-4 text-xs mt-1">
            <span className="text-slate-600">Teaching:</span>
            <span className="font-bold text-maroon-700">{data.x.toFixed(1)}</span>
          </div>
          <div className="flex justify-between gap-4 text-xs mt-1">
            <span className="text-slate-600">Research:</span>
            <span className="font-bold text-slate-700">{data.y.toFixed(1)}</span>
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
      
      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm shadow-black/5 flex flex-col justify-center transition-all hover:shadow-md">
          <p className="text-xs font-bold uppercase text-slate-400 tracking-wider">Total Submissions</p>
          <p className="text-3xl font-black text-slate-800 mt-1">{kpis.totalSubmissions}</p>
        </div>
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm shadow-black/5 flex flex-col justify-center transition-all hover:shadow-md">
          <p className="text-xs font-bold uppercase text-slate-400 tracking-wider">Department Average</p>
          <div className="flex items-baseline gap-1 mt-1">
            <p className="text-3xl font-black text-slate-800">{kpis.averageScore}</p>
            <p className="text-sm font-bold text-slate-400">pts</p>
          </div>
        </div>
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm shadow-black/5 flex flex-col justify-center border-l-4 border-l-maroon-700 transition-all hover:shadow-md">
          <p className="text-xs font-bold uppercase text-maroon-700 tracking-wider">Highest Score</p>
          <p className="text-xl font-black text-slate-800 mt-1 truncate" title={kpis.topPerformer}>{kpis.topPerformer}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Leaderboard Chart (Full Width) */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm shadow-black/5 col-span-1 lg:col-span-2 transition-all hover:shadow-md">
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

        {/* Radar Chart (Half Width) */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm shadow-black/5 transition-all hover:shadow-md">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-3">
            <h3 className="text-sm font-bold uppercase tracking-wide text-gray-800">Holistic Profile</h3>
            <select 
              className="text-xs border border-slate-300 rounded-md shadow-sm py-1.5 px-3 focus:border-maroon-500 focus:ring-maroon-500 outline-none w-full sm:w-auto font-medium text-slate-700 bg-slate-50"
              value={selectedFacultyId || ''}
              onChange={(e) => setSelectedFacultyId(e.target.value)}
            >
              {radarData.map(f => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
          </div>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart cx="50%" cy="50%" outerRadius="65%" data={selectedFacultyRadarData}>
                <PolarGrid stroke="#e2e8f0" />
                <PolarAngleAxis dataKey="subject" tick={{ fill: '#334155', fontSize: 11, fontWeight: 600 }} />
                <PolarRadiusAxis angle={30} domain={[0, 'dataMax']} tick={false} axisLine={false} />
                <RechartsTooltip wrapperStyle={{ fontSize: '12px', zIndex: 100 }} contentStyle={{ borderRadius: '8px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '12px' }} />
                <Radar name="Dept Average" dataKey="Department" stroke="#94a3b8" strokeWidth={2} strokeDasharray="4 4" fill="#cbd5e1" fillOpacity={0.2} animationDuration={1000} />
                <Radar name="Selected Faculty" dataKey="Faculty" stroke="#800000" strokeWidth={2} fill="#800000" fillOpacity={0.5} animationDuration={1000} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Scatter Plot (Half Width) */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm shadow-black/5 transition-all hover:shadow-md">
          <h3 className="text-sm font-bold uppercase tracking-wide text-gray-800 mb-1">Outlier Identification Matrix</h3>
          <p className="text-[10px] font-bold text-slate-400 mb-6 uppercase tracking-widest">Teaching vs Research Scores</p>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 10, right: 20, bottom: 20, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis type="number" dataKey="x" name="Teaching" tick={{fontSize: 11, fill: '#64748b'}} tickLine={false} axisLine={{stroke: '#cbd5e1'}} >
                  <Label value="Teaching Score →" offset={-15} position="insideBottom" style={{fontSize: 11, fill: '#64748b', fontWeight: 600}} />
                </XAxis>
                <YAxis type="number" dataKey="y" name="Research" tick={{fontSize: 11, fill: '#64748b'}} tickLine={false} axisLine={{stroke: '#cbd5e1'}} >
                  <Label value="Research Score →" angle={-90} position="insideLeft" offset={-5} style={{fontSize: 11, fill: '#64748b', fontWeight: 600}} />
                </YAxis>
                <ZAxis type="number" range={[80, 80]} />
                <RechartsTooltip cursor={{strokeDasharray: '3 3'}} content={<CustomScatterTooltip />} />
                <Scatter name="Faculty" data={scatterData} fill="#800000" animationDuration={1200} className="drop-shadow-sm cursor-pointer hover:opacity-80 transition-opacity" />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </div>

      </div>
    </div>
  );
}
