import React from 'react';

interface OpenCodeIconProps {
  className?: string;
  width?: number;
  height?: number;
}

export const OpenCodeIcon: React.FC<OpenCodeIconProps> = ({
  className = '',
  width = 70,
  height = 70
}) => {
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 70 70"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M0 13H35V58H0V13ZM26.25 22.1957H8.75V48.701H26.25V22.1957Z"
        fill="currentColor"
      />
      <path
        d="M43.75 13H70V22.1957H52.5V48.701H70V57.8967H43.75V13Z"
        fill="currentColor"
      />
    </svg>
  );
};