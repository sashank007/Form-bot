/**
 * Template Manager Component
 */

import React, { useEffect, useState } from 'react';
import { FormTemplate, SavedFormData } from '../../types';
import { getAllTemplates, deleteTemplate, saveTemplate } from '../../utils/templateStorage';
import { getAllFormData } from '../../utils/storage';

const TemplateManager: React.FC = () => {
  const [templates, setTemplates] = useState<FormTemplate[]>([]);
  const [profiles, setProfiles] = useState<SavedFormData[]>([]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const [loadedTemplates, loadedProfiles] = await Promise.all([
      getAllTemplates(),
      getAllFormData(),
    ]);
    setTemplates(loadedTemplates);
    setProfiles(loadedProfiles);
  };

  const handleDelete = async (id: string) => {
    if (confirm('Delete this template?')) {
      await deleteTemplate(id);
      loadData();
    }
  };

  const handleChangeProfile = async (templateId: string, newProfileId: string) => {
    const template = templates.find(t => t.id === templateId);
    if (template) {
      template.linkedProfileId = newProfileId;
      template.updatedAt = Date.now();
      await saveTemplate(template);
      loadData();
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Form Templates</h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            Saved templates for quick form filling
          </p>
        </div>
      </div>

      {templates.length === 0 ? (
        <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-card">
          <svg className="w-16 h-16 mx-auto text-gray-400 dark:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <h3 className="mt-4 text-lg font-medium text-gray-900 dark:text-gray-100">No templates yet</h3>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            Fill a form 60%+ and click "Save as Template" in the extension popup
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {templates.map(template => {
            const linkedProfile = profiles.find(p => p.id === template.linkedProfileId);
            
            return (
              <div key={template.id} className="bg-white dark:bg-gray-800 rounded-card shadow p-6">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">
                      {template.name}
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                      {template.urlPattern}
                    </p>
                    <div className="mt-3 flex items-center gap-4 text-sm">
                      <span className="text-gray-600 dark:text-gray-400">
                        {template.fieldMappings.length} field mappings
                      </span>
                      <span className="text-gray-600 dark:text-gray-400">
                        Used {template.usageCount} time{template.usageCount !== 1 ? 's' : ''}
                      </span>
                      <span className="text-gray-500 dark:text-gray-500 text-xs">
                        {new Date(template.updatedAt).toLocaleDateString()}
                      </span>
                    </div>
                    
                    {/* Linked Profile */}
                    <div className="mt-3">
                      <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Linked Profile:
                      </label>
                      <select
                        value={template.linkedProfileId}
                        onChange={(e) => handleChangeProfile(template.id, e.target.value)}
                        className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                      >
                        {profiles.map(profile => (
                          <option key={profile.id} value={profile.id}>
                            {profile.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    
                    {/* Field Mappings Preview */}
                    <div className="mt-3">
                      <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Field Mappings:
                      </p>
                      <div className="grid grid-cols-2 gap-2">
                        {template.fieldMappings.slice(0, 4).map((mapping, idx) => (
                          <div key={idx} className="text-xs bg-gray-50 dark:bg-gray-700/50 rounded px-2 py-1">
                            <span className="text-gray-600 dark:text-gray-400">{mapping.fieldLabel || mapping.fieldName}</span>
                            <span className="text-gray-500 dark:text-gray-500"> → </span>
                            <span className="text-gray-900 dark:text-gray-100">{mapping.dataKey}</span>
                          </div>
                        ))}
                        {template.fieldMappings.length > 4 && (
                          <div className="text-xs text-gray-500 dark:text-gray-400 px-2 py-1">
                            +{template.fieldMappings.length - 4} more
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  <button
                    onClick={() => handleDelete(template.id)}
                    className="ml-4 p-2 text-danger hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                    title="Delete template"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default TemplateManager;

