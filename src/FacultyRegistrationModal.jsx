import React, { useState } from 'react';
import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

const DEPARTMENTS = [
  { code: 'CSE', name: 'Computer Science and Engineering' },
  { code: 'ECE', name: 'Electronics and Communication Engineering' },
  { code: 'EEE', name: 'Electrical and Electronics Engineering' },
  { code: 'MECH', name: 'Mechanical Engineering' },
  { code: 'CIVIL', name: 'Civil Engineering' },
  { code: 'IT', name: 'Information Technology' },
  { code: 'MECT', name: 'Mechatronics' },
  { code: 'CSBS', name: 'Computer Science and Business Systems' },
  { code: 'MCA', name: 'Computer Applications' },
  { code: 'ARCH', name: 'Architecture' },
  { code: 'MATH', name: 'Mathematics' },
  { code: 'AMCS', name: 'Applied Mathematics and Computational Science' },
  { code: 'PHY', name: 'Physics' },
  { code: 'CHEM', name: 'Chemistry' },
  { code: 'ENG', name: 'English' },
  { code: 'AI', name: 'Artificial Intelligence and Data Science' }
];

const DESIGNATIONS = [
  'Assistant Professor',
  'Associate Professor',
  'Professor',
  'Senior Professor',
  'Visiting Faculty',
  'Adjunct Faculty',
  'Emeritus Professor'
];

export default function FacultyRegistrationModal({ isOpen, onClose }) {
  const [activeTab, setActiveTab] = useState('lookup'); // 'lookup' | 'register'
  
  // Lookup state
  const [lookupEmail, setLookupEmail] = useState('');
  const [lookupResult, setLookupResult] = useState(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState('');

  // Register state
  const [regForm, setRegForm] = useState({
    name: '',
    email: '',
    department: 'CSE',
    designation: 'Assistant Professor',
    staffId: ''
  });
  const [regLoading, setRegLoading] = useState(false);
  const [regSuccess, setRegSuccess] = useState('');
  const [regError, setRegError] = useState('');

  if (!isOpen) return null;

  // Handle Directory Lookup
  const handleLookup = async (e) => {
    e?.preventDefault();
    if (!lookupEmail.trim()) return;

    try {
      setLookupLoading(true);
      setLookupError('');
      setLookupResult(null);

      const res = await axios.get(`${API_BASE_URL}/directory/lookup?email=${encodeURIComponent(lookupEmail.trim())}`);
      if (res.data?.success) {
        setLookupResult(res.data.data);
      }
    } catch (err) {
      setLookupError(err.response?.data?.message || 'Faculty profile not found in master directory.');
    } finally {
      setLookupLoading(false);
    }
  };

  // Handle Faculty Registration
  const handleRegister = async (e) => {
    e?.preventDefault();
    if (!regForm.name.trim() || !regForm.email.trim() || !regForm.department) {
      setRegError('Please fill in all required fields.');
      return;
    }

    try {
      setRegLoading(true);
      setRegError('');
      setRegSuccess('');

      const res = await axios.post(`${API_BASE_URL}/directory/register`, regForm);
      if (res.data?.success) {
        setRegSuccess(res.data.message);
        setLookupResult(res.data.data);
      }
    } catch (err) {
      setRegError(err.response?.data?.message || 'Failed to register faculty profile.');
    } finally {
      setRegLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="relative w-full max-w-xl rounded-2xl bg-white shadow-2xl border border-gray-200 overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Modal Header */}
        <div className="bg-gradient-to-r from-[#4A1519] to-[#3B1013] px-6 py-4 text-white flex items-center justify-between shadow-md">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-xl border border-white/20">
              🎓
            </div>
            <div>
              <h2 className="text-base font-bold tracking-tight">Faculty Directory & Onboarding</h2>
              <p className="text-xs text-red-200/90 font-medium">Verify your institutional roster status or register your profile</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white text-sm font-bold transition-all"
          >
            ✕
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex border-b border-gray-200 bg-gray-50/80 px-6 pt-3 gap-2">
          <button
            onClick={() => { setActiveTab('lookup'); setLookupError(''); setRegError(''); }}
            className={`pb-2.5 px-4 text-xs font-bold transition-all border-b-2 ${
              activeTab === 'lookup'
                ? 'border-[#4A1519] text-[#4A1519]'
                : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            🔍 Verify Directory Status
          </button>
          <button
            onClick={() => { setActiveTab('register'); setLookupError(''); setRegError(''); }}
            className={`pb-2.5 px-4 text-xs font-bold transition-all border-b-2 ${
              activeTab === 'register'
                ? 'border-[#4A1519] text-[#4A1519]'
                : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            ➕ Register New Faculty
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-4">

          {/* TAB 1: DIRECTORY LOOKUP */}
          {activeTab === 'lookup' && (
            <div className="space-y-4">
              <p className="text-xs text-gray-600 leading-relaxed">
                Enter your institutional <span className="font-semibold text-gray-800">@tce.edu</span> email address or personal login email to verify that your profile is enrolled in the master institutional directory.
              </p>

              <form onSubmit={handleLookup} className="flex gap-2">
                <input
                  type="email"
                  placeholder="e.g. shalinie@tce.edu or hodcse@tce.edu"
                  value={lookupEmail}
                  onChange={(e) => setLookupEmail(e.target.value)}
                  className="flex-1 px-3.5 py-2.5 text-xs rounded-xl border border-gray-300 focus:outline-none focus:border-[#4A1519] focus:ring-1 focus:ring-[#4A1519] shadow-sm text-gray-900"
                />
                <button
                  type="submit"
                  disabled={lookupLoading || !lookupEmail.trim()}
                  className="px-5 py-2.5 rounded-xl bg-[#4A1519] hover:bg-[#3B1013] text-white text-xs font-bold shadow-sm transition-all disabled:opacity-50 flex items-center gap-1.5"
                >
                  {lookupLoading ? (
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  ) : (
                    <span>Verify</span>
                  )}
                </button>
              </form>

              {lookupError && (
                <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium space-y-1">
                  <p className="font-bold">❌ {lookupError}</p>
                  <p className="text-[11px] text-rose-600">
                    If you recently joined TCE, switch to the "Register New Faculty" tab to onboard your profile.
                  </p>
                </div>
              )}

              {lookupResult && (
                <div className="p-4 rounded-xl bg-emerald-50/80 border border-emerald-200 space-y-3 shadow-xs">
                  <div className="flex items-center justify-between border-b border-emerald-200/60 pb-2">
                    <span className="text-xs font-bold text-emerald-900 flex items-center gap-1.5">
                      <span>✔</span> Verified Institutional Member
                    </span>
                    <span className={`text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full ${
                      lookupResult.role === 'HOD' ? 'bg-amber-200 text-amber-900' : 'bg-emerald-200 text-emerald-900'
                    }`}>
                      {lookupResult.role}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-[10px] font-bold text-gray-500 uppercase block">Faculty Name</span>
                      <span className="font-bold text-gray-900">{lookupResult.name}</span>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-gray-500 uppercase block">Department</span>
                      <span className="font-bold text-[#4A1519]">{lookupResult.department} ({lookupResult.departmentName})</span>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-gray-500 uppercase block">Designation</span>
                      <span className="font-semibold text-gray-800">{lookupResult.designation}</span>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-gray-500 uppercase block">Staff ID</span>
                      <span className="font-mono text-gray-700">{lookupResult.staffId || '—'}</span>
                    </div>
                    <div className="col-span-2">
                      <span className="text-[10px] font-bold text-gray-500 uppercase block">Enrolled Email(s)</span>
                      <span className="font-mono text-[11px] text-gray-800">
                        {lookupResult.personalEmail || lookupResult.email}
                        {lookupResult.hodEmail && lookupResult.role === 'HOD' ? ` • ${lookupResult.hodEmail}` : ''}
                      </span>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-emerald-200/60 text-[11px] text-emerald-800 font-medium">
                    👉 You are ready! Close this window and click <span className="font-bold">"Sign in with Google"</span> with this Google account to access your workspace.
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: REGISTER NEW FACULTY */}
          {activeTab === 'register' && (
            <div className="space-y-4">
              <p className="text-xs text-gray-600 leading-relaxed">
                Add your official academic profile to the TCE Performance Appraisal System database. Once submitted, your profile is immediately active for Google Single Sign-On.
              </p>

              {regSuccess && (
                <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold space-y-1">
                  <p className="font-bold">🎉 {regSuccess}</p>
                  <p className="text-[11px] text-emerald-700 font-normal">
                    You may now close this window and sign in using Google.
                  </p>
                </div>
              )}

              {regError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">
                  {regError}
                </div>
              )}

              <form onSubmit={handleRegister} className="space-y-3">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Full Name (with title):</label>
                  <input
                    type="text"
                    placeholder="e.g. Dr. K. Ramesh"
                    value={regForm.name}
                    onChange={(e) => setRegForm({ ...regForm, name: e.target.value })}
                    required
                    className="w-full px-3.5 py-2 text-xs rounded-xl border border-gray-300 focus:outline-none focus:border-[#4A1519] focus:ring-1 focus:ring-[#4A1519] shadow-sm text-gray-900"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Official TCE Email / Google Email:</label>
                  <input
                    type="email"
                    placeholder="e.g. kramesh@tce.edu"
                    value={regForm.email}
                    onChange={(e) => setRegForm({ ...regForm, email: e.target.value })}
                    required
                    className="w-full px-3.5 py-2 text-xs rounded-xl border border-gray-300 focus:outline-none focus:border-[#4A1519] focus:ring-1 focus:ring-[#4A1519] shadow-sm text-gray-900"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">Department:</label>
                    <select
                      value={regForm.department}
                      onChange={(e) => setRegForm({ ...regForm, department: e.target.value })}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-gray-300 focus:outline-none focus:border-[#4A1519] focus:ring-1 focus:ring-[#4A1519] shadow-sm text-gray-900 bg-white"
                    >
                      {DEPARTMENTS.map((dept) => (
                        <option key={dept.code} value={dept.code}>
                          {dept.code} - {dept.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">Designation:</label>
                    <select
                      value={regForm.designation}
                      onChange={(e) => setRegForm({ ...regForm, designation: e.target.value })}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-gray-300 focus:outline-none focus:border-[#4A1519] focus:ring-1 focus:ring-[#4A1519] shadow-sm text-gray-900 bg-white"
                    >
                      {DESIGNATIONS.map((desig) => (
                        <option key={desig} value={desig}>
                          {desig}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Staff ID / Employee Code (optional):</label>
                  <input
                    type="text"
                    placeholder="e.g. TCE-CS-104"
                    value={regForm.staffId}
                    onChange={(e) => setRegForm({ ...regForm, staffId: e.target.value })}
                    className="w-full px-3.5 py-2 text-xs rounded-xl border border-gray-300 focus:outline-none focus:border-[#4A1519] focus:ring-1 focus:ring-[#4A1519] shadow-sm text-gray-900"
                  />
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={regLoading}
                    className="w-full py-2.5 px-4 rounded-xl bg-[#4A1519] hover:bg-[#3B1013] text-white font-bold text-xs shadow-md transition-all disabled:opacity-50 flex items-center justify-center space-x-2"
                  >
                    {regLoading ? (
                      <>
                        <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        <span>Registering Profile...</span>
                      </>
                    ) : (
                      <span>Complete Registration</span>
                    )}
                  </button>
                </div>
              </form>
            </div>
          )}

        </div>

        {/* Modal Footer */}
        <div className="p-3 px-6 bg-gray-50 border-t border-gray-200 flex items-center justify-between text-xs text-gray-500">
          <span>Thiagarajar College of Engineering • Appraisal System</span>
          <button
            onClick={onClose}
            className="px-3.5 py-1 rounded-xl border border-gray-300 bg-white hover:bg-gray-100 text-gray-700 font-bold text-xs transition-all"
          >
            Close
          </button>
        </div>

      </div>
    </div>
  );
}
