/**
 * Scanner: CryptoJobsList Korea
 * Scrapes job postings in Seoul/South Korea from CryptoJobsList and Web3.career.
 * Signal: korea_job_posting (+15)
 */

import type { ScannerModule, ScanContext, RawSignal } from '../types';
import { SIGNAL_WEIGHTS } from '../types';
import { findProspectMatch } from '../matching';

export const cryptoJobsKoreaScanner: ScannerModule = {
  id: 'crypto_jobs_korea',
  name: 'CryptoJobsList Korea',
  cadence: 'weekly',
  requires: 'scraping',
  signalTypes: ['korea_job_posting'],

  async scan(ctx: ScanContext): Promise<RawSignal[]> {
    const signals: RawSignal[] = [];
    const seenCompanies = new Set<string>();

    // Source 1: CryptoJobsList Seoul
    try {
      const res = await fetch('https://cryptojobslist.com/jobs-seoul', {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          Accept: 'text/html',
        },
        signal: AbortSignal.timeout(15000),
      });
      if (res.ok) {
        const html = await res.text();
        const jobs = extractJobsFromCryptoJobsList(html);
        for (const job of jobs) {
          if (seenCompanies.has(job.company.toLowerCase())) continue;
          seenCompanies.add(job.company.toLowerCase());

          const match = findProspectMatch(job.company, '', ctx.prospects);
          if (match) {
            const config = SIGNAL_WEIGHTS.korea_job_posting;
            signals.push({
              prospect_id: match.id,
              project_name: match.name,
              signal_type: 'korea_job_posting',
              headline: `Korea job: ${job.title} at ${job.company}`,
              snippet: `${job.company} is hiring for "${job.title}" in Seoul/Korea. This indicates earmarked Korea budget and active market entry.`,
              source_url: job.url || 'https://cryptojobslist.com/jobs-seoul',
              source_name: 'cryptojobslist',
              relevancy_weight: config.weight,
              tier: config.tier,
              shelf_life_days: config.shelf_life_days,
              expires_at: new Date(Date.now() + config.shelf_life_days * 24 * 60 * 60 * 1000).toISOString(),
            });
          }
        }
      }
    } catch (err) {
      console.error('CryptoJobsList Seoul scrape error:', err);
    }

    await new Promise(r => setTimeout(r, 1000));

    // Source 2: Web3.career South Korea
    try {
      const res = await fetch('https://web3.career/web3-jobs-south-korea', {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          Accept: 'text/html',
        },
        signal: AbortSignal.timeout(15000),
      });
      if (res.ok) {
        const html = await res.text();
        const jobs = extractJobsFromWeb3Career(html);
        for (const job of jobs) {
          if (seenCompanies.has(job.company.toLowerCase())) continue;
          seenCompanies.add(job.company.toLowerCase());

          const match = findProspectMatch(job.company, '', ctx.prospects);
          if (match) {
            const config = SIGNAL_WEIGHTS.korea_job_posting;
            signals.push({
              prospect_id: match.id,
              project_name: match.name,
              signal_type: 'korea_job_posting',
              headline: `Korea job: ${job.title} at ${job.company}`,
              snippet: `${job.company} is hiring for "${job.title}" in South Korea via Web3.career.`,
              source_url: job.url || 'https://web3.career/web3-jobs-south-korea',
              source_name: 'web3career',
              relevancy_weight: config.weight,
              tier: config.tier,
              shelf_life_days: config.shelf_life_days,
              expires_at: new Date(Date.now() + config.shelf_life_days * 24 * 60 * 60 * 1000).toISOString(),
            });
          }
        }
      }
    } catch (err) {
      console.error('Web3.career Korea scrape error:', err);
    }

    return signals;
  },
};

interface JobPosting {
  title: string;
  company: string;
  url?: string;
}

function extractJobsFromCryptoJobsList(html: string): JobPosting[] {
  const jobs: JobPosting[] = [];
  // Extract job cards — CryptoJobsList uses structured job listing elements
  const jobRegex = /<a[^>]*href="(\/[^"]*)"[^>]*>[\s\S]*?<h2[^>]*>(.*?)<\/h2>[\s\S]*?<span[^>]*class="[^"]*company[^"]*"[^>]*>(.*?)<\/span>/gi;
  let match;
  while ((match = jobRegex.exec(html)) !== null) {
    const url = `https://cryptojobslist.com${match[1]}`;
    const title = match[2].replace(/<[^>]*>/g, '').trim();
    const company = match[3].replace(/<[^>]*>/g, '').trim();
    if (title && company) {
      jobs.push({ title, company, url });
    }
  }

  // Fallback: try simpler pattern
  if (jobs.length === 0) {
    const simpleRegex = /class="[^"]*job[^"]*"[^>]*>[\s\S]*?<[^>]*>(.*?)<\/[^>]*>[\s\S]*?(?:company|org)[^>]*>(.*?)<\//gi;
    while ((match = simpleRegex.exec(html)) !== null) {
      const title = match[1].replace(/<[^>]*>/g, '').trim();
      const company = match[2].replace(/<[^>]*>/g, '').trim();
      if (title && company && title.length > 3 && company.length > 1) {
        jobs.push({ title, company });
      }
    }
  }

  return jobs.slice(0, 30);
}

function extractJobsFromWeb3Career(html: string): JobPosting[] {
  const jobs: JobPosting[] = [];
  // Web3.career uses table-like job listings
  const jobRegex = /<tr[^>]*>[\s\S]*?<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>[\s\S]*?<\/tr>/gi;
  let match;
  while ((match = jobRegex.exec(html)) !== null) {
    const url = match[1].startsWith('http') ? match[1] : `https://web3.career${match[1]}`;
    const title = match[2].replace(/<[^>]*>/g, '').trim();
    const company = match[3].replace(/<[^>]*>/g, '').trim();
    if (title && company && title.length > 3) {
      jobs.push({ title, company, url });
    }
  }
  return jobs.slice(0, 30);
}
