import numeral from 'numeral';

export interface Channel {
  id: string;
  subdomain: string;
  channelName: string;
  subscriberCount: number;
  viewCount: number;
  updatedAt: string;
  thumbnails: {
    default?: { url: string };
    medium?: { url: string };
    high?: { url: string };
  } | null;
  imageError?: boolean;
}

export interface Video {
  id: string;
  title: string;
  publishedAt: string;
  viewCount: number;
  channel: string;
  channelId: string;
  duration: number; // Duration in seconds
  thumbnails: {
    default?: { url: string };
    medium?: { url: string };
    high?: { url: string };
    maxres?: { url: string };
  };
}

export interface SearchResult {
  id: string;
  name: string;
  description: string;
  thumbnails: {
    default?: { url: string };
  };
}

export const getBaseUrl = (subdomain?: string): string => {
  if (import.meta.env.VITE_ENVIRONMENT === 'production') {
    return subdomain ? `https://${subdomain}.tube.yt` : 'https://tube.yt';
  }
  return 'http://localhost:3003';
};

export const formatNumber = (n: number): string => {
  return numeral(n).format('0.0a');
};

export const parseThumbnails = (thumbnails: string) => {
  return thumbnails !== 'no_value' ? JSON.parse(thumbnails) : null;
};

export const getSubdomain = (): string => {
  const host = window.location.hostname;

  // On localhost, check for ?channel= query parameter
  if (host === 'localhost' || host === '127.0.0.1') {
    const params = new URLSearchParams(window.location.search);
    return params.get('channel') || '';
  }

  // In production, check for subdomain
  const parts = host.split('.');
  return parts.length > 2 ? parts[0] : '';
};

export const formatDate = (date: string): string => {
  return new Date(date).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
};
