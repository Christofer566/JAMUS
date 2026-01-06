
'use client';

import React from 'react';
import { Heart, Music, Star } from 'lucide-react';
import { MyJamProfileProps } from '@/types/my-jam';

/**
 * Section 1: My Profile (Final Version)
 * Based on Case B with immersive glow effects and branding.
 */
const MyJamProfile: React.FC<MyJamProfileProps> = ({
  nickname,
  oderId,
  tier,
  hasPremium,
  hasEarlyBird,
  topJam,
}) => {
  return (
    <div className="relative group overflow-hidden rounded-3xl border border-white/10 bg-[#2A2B39]/50 backdrop-blur-sm p-8 transition-all hover:bg-white/10 hover:[box-shadow:0_0_40px_rgba(61,223,133,0.15)]">
      {/* Glow Background Effect */}
      <div className="absolute -top-24 -left-24 w-64 h-64 bg-[#3DDF85]/5 blur-[100px] pointer-events-none group-hover:bg-[#3DDF85]/10 transition-all"></div>
      
      <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-6">
          {/* Avatar with Glow border */}
          <div className="h-24 w-24 rounded-full p-1 bg-gradient-to-tr from-[#3DDF85]/40 via-transparent to-[#A55EEA]/40 transition-transform group-hover:scale-105 duration-500">
            <div className="h-full w-full rounded-full bg-[#1B1C26] flex items-center justify-center overflow-hidden">
              <img 
                src="https://picsum.photos/100/100?grayscale" 
                className="w-full h-full rounded-full object-cover opacity-60 mix-blend-luminosity" 
                alt="Profile"
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <h2 className="text-3xl font-black text-white tracking-tight group-hover:[text-shadow:0_0_15px_rgba(61,223,133,0.5)] transition-all">
                {nickname}
              </h2>
              {hasPremium && <Star size={18} className="text-[#F2C94C] fill-[#F2C94C]" />}
            </div>
            <p className="text-sm font-mono text-gray-500 bg-white/5 px-2 py-0.5 rounded border border-white/5 w-fit">
              # {oderId}
            </p>
            
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="rounded-full px-3 py-1 text-[10px] font-bold shadow-sm bg-[#3DDF85] text-[#14151C]">
                {tier}
              </span>
              {hasPremium && (
                <span className="rounded-full px-3 py-1 text-[10px] font-bold shadow-sm bg-gradient-to-b from-[#F2C94C] to-[#FFD166] text-[#1B1C26]">
                  Premium User
                </span>
              )}
              {hasEarlyBird && (
                <span className="rounded-full px-3 py-1 text-[10px] font-bold shadow-sm bg-[#FF7B7B] text-white">
                  Early Bird
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Top JAM Card */}
        {topJam && (
          <div className="w-72 bg-[#14151C] border border-white/10 rounded-2xl p-4 transition-all hover:border-[#3DDF85]/40 group/card">
            <div className="flex justify-between items-center mb-3">
               <div className="flex items-center gap-2 text-gray-400">
                  <Music size={14} />
                  <span className="text-[10px] font-bold uppercase tracking-widest">My Best JAM</span>
               </div>
               <div className="flex items-center gap-1 text-[#FF7B7B]">
                  <Heart size={14} className="group-hover/card:scale-125 transition-transform" />
                  <span className="text-xs font-bold">{topJam.likes}</span>
               </div>
            </div>
            <div className="flex gap-4">
               <img src={topJam.coverUrl} className="w-16 h-16 rounded-xl shadow-lg shadow-black/50" alt="Cover" />
               <div className="flex flex-col justify-center overflow-hidden">
                  <h4 className="text-sm font-bold text-white truncate">{topJam.title}</h4>
                  <p className="text-xs text-gray-400 truncate">{topJam.artist}</p>
               </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default MyJamProfile;
