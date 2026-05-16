import React, { useState, useEffect, useRef } from 'react';

interface InputModalProps {
  isOpen: boolean;
  title: string;
  message: React.ReactNode;
  placeholder?: string;
  defaultValue?: string;
  type?: 'text' | 'select' | 'password' | 'confirm';
  options?: { label: string; value: string }[];
  onConfirm: (value: string) => void;
  onCancel: () => void;
}

export function InputModal({
  isOpen,
  title,
  message,
  placeholder = '',
  defaultValue = '',
  type = 'text',
  options = [],
  onConfirm,
  onCancel
}: InputModalProps) {
  const [value, setValue] = useState(defaultValue);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        setValue(defaultValue);
        setShowPassword(false);
      }, 0);
    }
  }, [isOpen, defaultValue]);
  const inputRef = useRef<HTMLInputElement>(null);
  const selectRef = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        if (type === 'select') {
          selectRef.current?.focus();
        } else if (type !== 'confirm') {
          inputRef.current?.focus();
        }
      }, 0);
    }
  }, [isOpen, type, defaultValue]);



  if (!isOpen) return null;

  let strength = 0;
  if (type === 'password' && value) {
    if (value.length >= 8) strength++;
    if (/[A-Z]/.test(value)) strength++;
    if (/[0-9]/.test(value)) strength++;
    if (/[^A-Za-z0-9]/.test(value)) strength++;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50 backdrop-blur-sm">
      <div
        className="bg-white rounded-xl max-w-md w-full p-6 shadow-2xl relative"
        role="dialog"
        aria-modal="true"
        aria-labelledby="input-modal-title"
      >
        <h2 id="input-modal-title" className="text-xl font-bold text-gray-900 mb-2">
          {title}
        </h2>
        <div className="text-gray-600 mb-4">{message}</div>

        {type === 'select' ? (
          <select
            ref={selectRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                onConfirm(value);
              } else if (e.key === 'Escape') {
                onCancel();
              }
            }}
            className="w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 mb-6"
          >
            {options.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        ) : type === 'password' ? (
          <div className="relative mb-6">
            <input
              ref={inputRef}
              type={showPassword ? 'text' : 'password'}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  onConfirm(value);
                } else if (e.key === 'Escape') {
                  onCancel();
                }
              }}
              placeholder={placeholder}
              className="w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 pr-16"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-2 text-sm text-gray-500 hover:text-gray-700 focus:outline-none"
            >
              {showPassword ? "Hide" : "Show"}
            </button>
            {value && (
              <div className="mt-2 text-xs">
                <div className="flex gap-1 h-1.5 mb-1">
                  {[1, 2, 3, 4].map((level) => (
                    <div
                      key={level}
                      className={`flex-1 rounded-full ${
                        strength >= level
                          ? strength <= 1 ? 'bg-red-500' : strength === 2 ? 'bg-yellow-500' : strength === 3 ? 'bg-blue-500' : 'bg-green-500'
                          : 'bg-gray-200'
                      }`}
                    />
                  ))}
                </div>
                <span className={`${strength <= 1 ? 'text-red-500' : strength === 2 ? 'text-yellow-600' : strength === 3 ? 'text-blue-600' : 'text-green-600'}`}>
                  {strength <= 1 ? 'Weak' : strength === 2 ? 'Fair' : strength === 3 ? 'Good' : 'Strong'}
                </span>
              </div>
            )}
          </div>
        ) : type === 'confirm' ? (
          <div className="mb-6"></div>
        ) : (
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                onConfirm(value);
              } else if (e.key === 'Escape') {
                onCancel();
              }
            }}
            placeholder={placeholder}
            className="w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 mb-6"
          />
        )}

        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 focus-visible:ring-offset-2"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(value)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}
