import { galleryItems, reelItems } from './gallery-data.ts';

/** Public TikTok figures for @newdec_yvn, read on 29.10.2026 (RESEARCH.md). */
export const tiktokStats = {
  followers: '2 156',
  likes: '7 663',
  videos: '31',
  asOf: '29.10.2026',
};

export interface GalleryItem {
  src: string;
  alt: string;
  caption: string;
  layout: 'tall' | 'wide' | 'sq';
  width: number;
  height: number;
}

export interface ReelItem {
  href: string;
  src: string;
  alt: string;
  title: string;
  views: string;
}

export const gallery: GalleryItem[] = galleryItems;
export const reels: ReelItem[] = reelItems;
