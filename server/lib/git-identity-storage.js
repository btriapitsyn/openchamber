import fs from 'fs';
import path from 'path';
import os from 'os';

// Storage path for git identity profiles
const STORAGE_DIR = path.join(os.homedir(), '.config', 'openchamber');
const STORAGE_FILE = path.join(STORAGE_DIR, 'git-identities.json');

// Ensure storage directory exists
function ensureStorageDir() {
  if (!fs.existsSync(STORAGE_DIR)) {
    fs.mkdirSync(STORAGE_DIR, { recursive: true });
  }
}

// Load profiles from storage
export function loadProfiles() {
  ensureStorageDir();

  if (!fs.existsSync(STORAGE_FILE)) {
    return { profiles: [] };
  }

  try {
    const content = fs.readFileSync(STORAGE_FILE, 'utf8');
    const data = JSON.parse(content);
    return data;
  } catch (error) {
    console.error('Failed to load git identity profiles:', error);
    return { profiles: [] };
  }
}

// Save profiles to storage
export function saveProfiles(data) {
  ensureStorageDir();

  try {
    fs.writeFileSync(STORAGE_FILE, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error('Failed to save git identity profiles:', error);
    throw error;
  }
}

// Get all profiles
export function getProfiles() {
  const data = loadProfiles();
  return data.profiles || [];
}

// Get profile by ID
export function getProfile(id) {
  const profiles = getProfiles();
  return profiles.find(p => p.id === id) || null;
}

// Create new profile
export function createProfile(profileData) {
  const profiles = getProfiles();

  // Check if ID already exists
  if (profiles.some(p => p.id === profileData.id)) {
    throw new Error(`Profile with ID "${profileData.id}" already exists`);
  }

  // Validate required fields
  if (!profileData.id || !profileData.userName || !profileData.userEmail) {
    throw new Error('Profile must have id, userName, and userEmail');
  }

  const newProfile = {
    id: profileData.id,
    name: profileData.name || profileData.userName,
    userName: profileData.userName,
    userEmail: profileData.userEmail,
    sshKey: profileData.sshKey || null,
    color: profileData.color || 'keyword',
    icon: profileData.icon || 'branch'
  };

  profiles.push(newProfile);
  saveProfiles({ profiles });

  return newProfile;
}

// Update existing profile
export function updateProfile(id, updates) {
  const profiles = getProfiles();
  const index = profiles.findIndex(p => p.id === id);

  if (index === -1) {
    throw new Error(`Profile with ID "${id}" not found`);
  }

  // Merge updates with existing profile
  profiles[index] = {
    ...profiles[index],
    ...updates,
    id: profiles[index].id // Prevent ID changes
  };

  saveProfiles({ profiles });
  return profiles[index];
}

// Delete profile
export function deleteProfile(id) {
  const profiles = getProfiles();
  const filteredProfiles = profiles.filter(p => p.id !== id);

  if (filteredProfiles.length === profiles.length) {
    throw new Error(`Profile with ID "${id}" not found`);
  }

  saveProfiles({ profiles: filteredProfiles });
  return true;
}
