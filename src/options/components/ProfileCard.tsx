import React from 'react';
import { SavedFormData, ProfileType } from '../../types';

interface ProfileCardProps {
  profile: SavedFormData;
  onEdit: (profile: SavedFormData) => void;
  onDelete: (id: string) => void;
}

const PROFILE_GRADIENTS: Record<ProfileType | 'default', string> = {
  'user': 'from-slate-400 via-slate-300 to-slate-200',
  'resume': 'from-amber-400 via-orange-300 to-yellow-200',
  'crm': 'from-blue-400 via-cyan-300 to-sky-200',
  'google-sheets': 'from-emerald-400 via-green-300 to-teal-200',
  'zapier': 'from-violet-400 via-purple-300 to-fuchsia-200',
  'default': 'from-indigo-400 via-purple-300 to-pink-200',
};

const PROFILE_ACCENTS: Record<ProfileType | 'default', string> = {
  'user': 'from-slate-500 to-slate-600',
  'resume': 'from-amber-500 to-orange-600',
  'crm': 'from-blue-500 to-cyan-600',
  'google-sheets': 'from-emerald-500 to-green-600',
  'zapier': 'from-violet-500 to-purple-600',
  'default': 'from-indigo-500 to-purple-600',
};

const PROFILE_ICONS: Record<ProfileType | 'default', string> = {
  'user': '👤',
  'resume': '📄',
  'crm': '💼',
  'google-sheets': '📊',
  'zapier': '⚡',
  'default': '📋',
};

const ProfileCard: React.FC<ProfileCardProps> = ({ profile, onEdit, onDelete }) => {
  const profileType = profile.profileType || 'default';
  const gradient = PROFILE_GRADIENTS[profileType] || PROFILE_GRADIENTS.default;
  const accent = PROFILE_ACCENTS[profileType] || PROFILE_ACCENTS.default;
  const icon = PROFILE_ICONS[profileType] || PROFILE_ICONS.default;
  
  const fieldCount = Object.keys(profile.data).length;
  const filledFields = Object.values(profile.data).filter(v => v && String(v).trim()).length;
  const lastUpdated = new Date(profile.updatedAt);
  const daysSinceUpdate = Math.floor((Date.now() - profile.updatedAt) / (1000 * 60 * 60 * 24));
  
  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(word => word[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const formatDate = (date: Date) => {
    if (daysSinceUpdate === 0) return 'Today';
    if (daysSinceUpdate === 1) return 'Yesterday';
    if (daysSinceUpdate < 7) return `${daysSinceUpdate}d ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const getProfileTypeLabel = (type: ProfileType | 'default'): string => {
    const labels: Record<ProfileType | 'default', string> = {
      'user': 'Personal Profile',
      'resume': 'Resume Data',
      'crm': 'CRM Contact',
      'google-sheets': 'Google Sheets',
      'zapier': 'Zapier Import',
      'default': 'Profile',
    };
    return labels[type] || labels.default;
  };

  const previewFields = Object.entries(profile.data)
    .filter(([_, value]) => value && String(value).trim())
    .slice(0, 3);

  return (
    <div className="group relative bg-white dark:bg-gray-800 rounded-2xl shadow-md hover:shadow-xl transition-all duration-300 overflow-hidden border border-gray-100 dark:border-gray-700">
      {/* Background Pattern */}
      <div className={`absolute inset-0 bg-gradient-to-br ${gradient} opacity-20`} />
      
      {/* Cloud-like decorative element */}
      <div className="absolute top-0 left-0 right-0 h-24 overflow-hidden">
        <div className={`absolute inset-0 bg-gradient-to-b ${gradient} opacity-40`} />
        <svg className="absolute bottom-0 w-full text-white dark:text-gray-800" viewBox="0 0 400 40" preserveAspectRatio="none">
          <path d="M0,40 C100,20 200,30 300,15 C350,8 380,20 400,40 L400,40 L0,40 Z" fill="currentColor" />
        </svg>
      </div>

      {/* Content */}
      <div className="relative pt-8 pb-4 px-5">
        {/* Avatar & Actions Row */}
        <div className="flex items-start justify-between mb-3">
          {/* Avatar */}
          <div className="relative">
            <div className={`w-16 h-16 rounded-full bg-gradient-to-br ${accent} flex items-center justify-center text-white text-xl font-bold shadow-lg ring-4 ring-white dark:ring-gray-800`}>
              {icon !== '👤' ? (
                <span className="text-2xl">{icon}</span>
              ) : (
                <span>{getInitials(profile.name)}</span>
              )}
            </div>
            {profile.profileType && profile.profileType !== 'user' && (
              <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-white dark:bg-gray-700 rounded-full flex items-center justify-center shadow-md">
                <span className="text-xs">✓</span>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex gap-1">
            <button
              onClick={() => onEdit(profile)}
              className="p-2 rounded-full bg-gray-100 dark:bg-gray-700 hover:bg-purple-100 dark:hover:bg-purple-900/30 text-gray-600 dark:text-gray-300 hover:text-purple-600 dark:hover:text-purple-400 transition-colors"
              title="Edit profile"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
            </button>
            <button
              onClick={() => onDelete(profile.id)}
              className="p-2 rounded-full bg-gray-100 dark:bg-gray-700 hover:bg-red-100 dark:hover:bg-red-900/30 text-gray-600 dark:text-gray-300 hover:text-red-600 dark:hover:text-red-400 transition-colors"
              title="Delete profile"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        </div>

        {/* Name & Type */}
        <div className="mb-4">
          <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 truncate">
            {profile.name}
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {getProfileTypeLabel(profileType)}
          </p>
        </div>

        {/* Preview Fields */}
        <div className="space-y-1.5 mb-4 min-h-[60px]">
          {previewFields.length > 0 ? (
            previewFields.map(([key, value]) => (
              <div key={key} className="flex items-center gap-2 text-sm">
                <span className="text-gray-400 dark:text-gray-500 capitalize truncate max-w-[80px]">
                  {key.replace(/([A-Z])/g, ' $1').trim()}:
                </span>
                <span className="text-gray-700 dark:text-gray-300 truncate flex-1">
                  {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                </span>
              </div>
            ))
          ) : (
            <p className="text-sm text-gray-400 dark:text-gray-500 italic">No fields added yet</p>
          )}
        </div>

        {/* Stats */}
        <div className="flex items-center justify-between pt-3 border-t border-gray-100 dark:border-gray-700">
          <div className="text-center flex-1">
            <div className="text-lg font-bold text-gray-900 dark:text-gray-100">{filledFields}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400">Fields</div>
          </div>
          <div className="w-px h-8 bg-gray-200 dark:bg-gray-700" />
          <div className="text-center flex-1">
            <div className="text-lg font-bold text-gray-900 dark:text-gray-100">{fieldCount}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400">Total</div>
          </div>
          <div className="w-px h-8 bg-gray-200 dark:bg-gray-700" />
          <div className="text-center flex-1">
            <div className="text-lg font-bold text-gray-900 dark:text-gray-100">{formatDate(lastUpdated)}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400">Updated</div>
          </div>
        </div>
      </div>

      {/* Bottom Accent Bar */}
      <div className={`h-1 bg-gradient-to-r ${accent}`} />
    </div>
  );
};

export default ProfileCard;

