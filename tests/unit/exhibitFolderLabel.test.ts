import { describe, it, expect } from 'vitest';
import { exhibitFolderKey, exhibitFolderLabel } from '../../src/utils/exhibitCombination';

// The chain ExhibitSelector inlined before the extraction; the helper must match it exactly.
const inlineFolderLabel = (name: string): string => name
  .replace(/\s+(Basic|Standard|Advanced|Premium|Enterprise)\s+Plan\s*-\s*(Basic|Standard|Advanced|Premium|Enterprise)?\s*(Include|Not\s*Include|Included|Not\s*Included)(\s+Features?)?\s*$/i, '')
  .replace(/\s+-\s*(Include|Not\s*Include|Included|Not\s*Included)(\s+Features?)?\s*$/i, '')
  .replace(/\s+(Basic|Standard|Advanced|Premium|Enterprise)\s+Plan\s*$/i, '')
  .replace(/\s+(std|adv|basic|standard|advanced|premium|enterprise)\s+(inscope|outscope|in scope|out scope|include|not include|included|not included)\s*$/i, '')
  .trim();

const NAMES = [
  'Content Sprawl DropBox',
  'Content Sprawl Egnyte',
  'Content Sprawl Egnyte - Not Included',
  'Content Sprawl Egnyte - Included Features',
  'Message Sprawl Slack Std Inscope',
  'Email Sprawl Gmail adv out scope',
  'Onedrive to Onedrive Basic Plan - Basic Include',
  'Egnyte to Google MyDrive Standard Plan - Standard Include',
  'MyDrive/ShareDrive - OneDrive/SharePointOnline Advanced Plan - Not Included Features',
  'Box to Dropbox Standard Plan',
  'Slack to Teams basic not include',
  '  Dropbox to OneDrive   ',
  '',
];

describe('exhibitFolderLabel — matches the ExhibitSelector folder name', () => {
  it.each(NAMES)('"%s"', (name) => {
    expect(exhibitFolderLabel(name)).toBe(inlineFolderLabel(name));
  });

  it('strips the include suffix so both files of a folder share a label', () => {
    expect(exhibitFolderLabel('Content Sprawl Egnyte - Not Included')).toBe('Content Sprawl Egnyte');
  });
});

describe('exhibitFolderKey', () => {
  it('ignores case and repeated whitespace', () => {
    expect(exhibitFolderKey('Content  Sprawl EGNYTE')).toBe(exhibitFolderKey('content sprawl egnyte'));
    expect(exhibitFolderKey('Content Sprawl Egnyte - Included')).toBe('content sprawl egnyte');
  });
});
