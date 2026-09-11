import React from 'react';
// @ts-ignore
import logoImg from '../assets/images/logo_1784642385346.jpg';

interface LogoProps {
  className?: string;
  size?: number;
}

export const Logo: React.FC<LogoProps> = ({ className = "w-10 h-10", size = 40 }) => {
  return (
    <div 
      className={`relative inline-flex items-center justify-center rounded-full border border-[#C5A059]/40 bg-[#161210] overflow-hidden shadow-md shrink-0 ${className}`} 
      style={{ width: size, height: size }}
    >
      <img 
        src={logoImg} 
        alt="Selin AI Logo" 
        className="w-full h-full object-cover scale-[1.05]" 
        referrerPolicy="no-referrer"
      />
    </div>
  );
};
