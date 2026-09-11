import React, { useState, useEffect } from 'react';
import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

export default function DepartmentManagementModal({ isOpen, onClose, currentUser, onHodRotated }) {
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  
  // Handover state
  const [handoverDept, setHandoverDept] = useState(null);
  const [deptFaculty, setDeptFaculty] = useState([]);
  const [selectedFacultyEmail, setSelectedFacultyEmail] = useState('');
  const [isSubmittingHandover, setIsSubmittingHandover] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  // Fetch departments
  const fetchDepartments = async () => {
    try {
      setLoading(true);
      setError('');
      const res = await axios.get(`${API_BASE_URL}/directory/departments`);
      if (res.data?.success) {
        setDepartments(res.data.data);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load department directory.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchDepartments();
      setSuccessMessage('');
    }
  }, [isOpen]);

  // Open Handover Dialog
  const handleOpenHandover = async (dept) => {
    setHandoverDept(dept);
    setSelectedFacultyEmail('');
    try {
      const res = await axios.get(`${API_BASE_URL}/directory/faculty?department=${dept.code}`);
      if (res.data?.success) {
        // Filter to list eligible faculty
        setDeptFaculty(res.data.data);
      }
    } catch (err) {
      console.error('Failed to load faculty for department:', err);
    }
  };

  // Submit Handover
  const handleConfirmHandover = async () => {
    if (!handoverDept || !selectedFacultyEmail) return;

    try {
      setIsSubmittingHandover(true);
      setError('');
      const res = await axios.post(`${API_BASE_URL}/directory/change-hod`, {
        department: handoverDept.code,
        newHodEmail: selectedFacultyEmail
      });

      if (res.data?.success) {
        setSuccessMessage(res.data.message);
        setHandoverDept(null);
        await fetchDepartments();
        onHodRotated?.();
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to perform leadership handover.');
    } finally {
      setIsSubmittingHandover(false);
    }
  };

  if (!isOpen) return null;

  const filteredDepts = departments.filter((d) =>
    d.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
    d.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (d.hod && d.hod.name?.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="relative w-full max-w-5xl rounded-2xl bg-white shadow-2xl border border-gray-200 overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Modal Header */}
        <div className="bg-gradient-to-r from-[#4A1519] to-[#3B1013] px-6 py-4 text-white flex items-center justify-between shadow-md">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-xl border border-white/20">
              🏛️
            </div>
            <div>
              <h2 className="text-lg font-bold tracking-tight">TCE Department Leadership & HoD Management</h2>
              <p className="text-xs text-red-200/90 font-medium">Manage Heads of Department, rotations, and departmental rosters</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white text-sm font-bold transition-all"
          >
            ✕
          </button>
        </div>

        {/* Success Alert */}
        {successMessage && (
          <div className="mx-6 mt-4 p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center justify-between shadow-sm animate-fade-in">
            <div className="flex items-center space-x-2">
              <span className="text-base">🎉</span>
              <span>{successMessage}</span>
            </div>
            <button onClick={() => setSuccessMessage('')} className="text-emerald-600 hover:text-emerald-900 font-bold">✕</button>
          </div>
        )}

        {/* Search & Actions Bar */}
        <div className="p-6 pb-2 flex flex-col sm:flex-row items-center justify-between gap-3 border-b border-gray-100">
          <div className="relative w-full sm:w-80">
            <input
              type="text"
              placeholder="Search department, code, or HoD..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-xs rounded-xl border border-gray-200 focus:outline-none focus:border-[#4A1519] focus:ring-1 focus:ring-[#4A1519] shadow-sm text-gray-800"
            />
            <span className="absolute left-3 top-2.5 text-gray-400 text-xs">🔍</span>
          </div>
          <div className="text-xs font-semibold text-gray-500">
            Total Academic Departments: <span className="text-[#4A1519] font-bold">{departments.length}</span>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-4">
          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center text-gray-400 space-y-3">
              <div className="w-8 h-8 border-3 border-[#4A1519] border-t-transparent rounded-full animate-spin"></div>
              <p className="text-xs font-medium">Loading departmental leadership directory...</p>
            </div>
          ) : error ? (
            <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs">
              {error}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredDepts.map((dept) => {
                return (
                  <div
                    key={dept.code}
                    className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm hover:shadow-md transition-all flex flex-col justify-between"
                  >
                    <div>
                      {/* Dept Top Row */}
                      <div className="flex items-start justify-between">
                        <span className="px-2.5 py-1 rounded-lg bg-red-50 text-[#4A1519] font-black text-xs border border-red-200">
                          {dept.code}
                        </span>
                        <span className="text-[11px] font-bold text-gray-500 bg-gray-50 px-2 py-0.5 rounded-full border border-gray-100">
                          👥 {dept.facultyCount} Faculty
                        </span>
                      </div>

                      {/* Dept Name */}
                      <h3 className="mt-2 text-sm font-bold text-gray-900 line-clamp-1" title={dept.name}>
                        {dept.name}
                      </h3>

                      {/* HoD Card */}
                      <div className="mt-3 p-3 rounded-xl bg-gray-50/80 border border-gray-100 flex items-center space-x-3">
                        <div className="w-10 h-10 rounded-full bg-[#4A1519] text-white font-bold text-sm flex items-center justify-center overflow-hidden flex-shrink-0 shadow-sm border border-white">
                          {dept.hod?.photo ? (
                            <img src={dept.hod.photo} alt={dept.hod.name} className="w-full h-full object-cover" />
                          ) : (
                            dept.hod?.name?.charAt(0) || 'H'
                          )}
                        </div>
                        <div className="overflow-hidden">
                          <p className="text-xs font-bold text-gray-900 truncate">
                            {dept.hod ? dept.hod.name : 'No HoD Assigned'}
                          </p>
                          <p className="text-[10px] text-gray-500 font-medium truncate">
                            {dept.hod ? dept.hod.designation : '—'}
                          </p>
                          <p className="text-[10px] text-[#4A1519] font-semibold truncate">
                            ✉️ {dept.hod ? (dept.hod.email) : `hod${dept.code.toLowerCase()}@tce.edu`}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between gap-2">
                      <button
                        onClick={() => handleOpenHandover(dept)}
                        className="w-full py-1.5 px-3 rounded-xl bg-[#4A1519] hover:bg-[#3B1013] text-white text-[11px] font-bold shadow-sm transition-all flex items-center justify-center space-x-1.5"
                      >
                        <span>🔄</span>
                        <span>Rotate / Change HoD</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 px-6 bg-gray-50 border-t border-gray-200 flex items-center justify-between text-xs text-gray-500">
          <span>Official TCE Institutional Leadership Governance</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl border border-gray-300 bg-white hover:bg-gray-100 text-gray-700 font-bold text-xs transition-all shadow-sm"
          >
            Close
          </button>
        </div>

      </div>

      {/* ── Sub-Modal: HoD Handover Dialog ───────────────────────────────────── */}
      {handoverDept && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl border border-gray-200 overflow-hidden animate-scale-up">
            
            <div className="bg-[#4A1519] px-6 py-4 text-white flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <span className="text-xl">🔄</span>
                <div>
                  <h3 className="text-sm font-bold">HoD Leadership Handover</h3>
                  <p className="text-[11px] text-red-200">{handoverDept.name} ({handoverDept.code})</p>
                </div>
              </div>
              <button
                onClick={() => setHandoverDept(null)}
                className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white text-xs font-bold"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs">
              
              {/* Current HoD Notice */}
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 space-y-1">
                <p className="font-bold text-amber-950 flex items-center space-x-1.5">
                  <span>ℹ️</span>
                  <span>Current Head of Department:</span>
                </p>
                <p className="font-semibold text-gray-800">
                  {handoverDept.hod?.name || 'None'} ({handoverDept.hod?.email || 'N/A'})
                </p>
                <p className="text-[10px] text-amber-800/90 leading-tight mt-1">
                  Upon handover confirmation, the outgoing HoD will automatically revert to standard Faculty status and can submit their own annual self-appraisals.
                </p>
              </div>

              {/* Select New HoD */}
              <div>
                <label className="block font-bold text-gray-700 mb-1.5">
                  Select New HoD from {handoverDept.code} Faculty:
                </label>
                <select
                  value={selectedFacultyEmail}
                  onChange={(e) => setSelectedFacultyEmail(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-gray-300 text-gray-900 font-medium text-xs focus:outline-none focus:border-[#4A1519] focus:ring-1 focus:ring-[#4A1519] bg-white shadow-sm"
                >
                  <option value="">-- Choose Professor / Associate Professor --</option>
                  {deptFaculty
                    .filter((f) => f.role !== 'HOD')
                    .map((fac) => (
                      <option key={fac.email} value={fac.email}>
                        {fac.name} — {fac.designation} ({fac.email})
                      </option>
                    ))}
                </select>
              </div>

              {/* Consequence Summary */}
              <div className="p-3 rounded-xl bg-gray-50 border border-gray-200 text-gray-600 text-[11px] space-y-1">
                <p className="font-bold text-gray-800">Automatic Handover Actions:</p>
                <ul className="list-disc pl-4 space-y-0.5 text-gray-500">
                  <li>Assigns role <span className="font-bold text-red-950">HOD</span> to newly selected professor.</li>
                  <li>Links generic departmental email <span className="font-mono text-[#4A1519] font-bold">hod{handoverDept.code.toLowerCase()}@tce.edu</span>.</li>
                  <li>Historical appraisals reviewed by the outgoing HoD remain permanently locked and unaltered.</li>
                </ul>
              </div>

            </div>

            {/* Sub-modal Action Buttons */}
            <div className="p-4 px-6 bg-gray-50 border-t border-gray-200 flex items-center justify-end space-x-3">
              <button
                onClick={() => setHandoverDept(null)}
                disabled={isSubmittingHandover}
                className="px-4 py-2 rounded-xl border border-gray-300 bg-white hover:bg-gray-100 text-gray-700 font-bold text-xs transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmHandover}
                disabled={!selectedFacultyEmail || isSubmittingHandover}
                className="px-5 py-2 rounded-xl bg-[#4A1519] hover:bg-[#3B1013] text-white font-bold text-xs shadow-md transition-all disabled:opacity-50 flex items-center space-x-2"
              >
                {isSubmittingHandover ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    <span>Processing Handover...</span>
                  </>
                ) : (
                  <>
                    <span>Confirm Handover</span>
                  </>
                )}
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
