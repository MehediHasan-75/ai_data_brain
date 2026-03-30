'use client';

import React, { useState } from 'react';
import clsx from 'clsx';
import { DialogClose } from '@/components/ui/dialog';
import { XIcon } from 'lucide-react';

const settingsOptions = [
  { label: 'Enable Notifications', key: 'notifications' },
  { label: 'Auto-Save Transactions', key: 'autoSave' },
  { label: 'Monthly Report Summary', key: 'monthlyReport' },
];

const UserSettings = () => {
  const [settings, setSettings] = useState({
    notifications: true,
    autoSave: false,
    monthlyReport: true,
  });

  const handleToggle = (key: string) => {
    setSettings((prev) => ({
      ...prev,
      [key]: !prev[key as keyof typeof settings],
    }));
  };

  return (
    <div
      className={clsx(
        'w-full max-w-md mx-auto rounded-xl p-6 shadow-lg transition-colors duration-300 relative',
        'bg-gray-900 text-white'
      )}
    >
      {}
      <DialogClose className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors">
        <XIcon className="h-5 w-5" />
        <span className="sr-only">Close</span>
      </DialogClose>
      
      <h2 className="text-2xl font-bold mb-4">User Settings</h2>
      <ul className="space-y-4">
        {settingsOptions.map((option) => {
          const isEnabled = settings[option.key as keyof typeof settings];
          return (
            <li key={option.key} className="flex justify-between items-center">
              <span>{option.label}</span>
              <button
                onClick={() => handleToggle(option.key)}
                className={clsx(
                  'w-12 h-6 rounded-full flex items-center px-1 transition-all duration-300',
                  isEnabled ? 'bg-blue-600 justify-end' : 'bg-gray-400 justify-start'
                )}
              >
                <span className="w-4 h-4 bg-white rounded-full shadow" />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

export default UserSettings;