/**
 * app/repair/new.tsx
 * Unified Repair Detail & New Fault Report Screen in Kuro Mobile.
 * Reuses the modern Repair Detail layout for creating new repair tickets (/repair/new),
 * supporting pre-filling equipment metadata from QR scanner / inventory navigation params,
 * 5 equal-box priority & condition row, single text inputs with inline autocomplete,
 * mobile date scroller, images & evidence attachments, and a prominent Create Ticket action.
 */

import React from 'react';
import RepairTicketDetailScreen, { type RepairDetailViewProps } from './[id]';

export default function NewRepairScreen(props: Omit<RepairDetailViewProps, 'mode'> = {}) {
  return <RepairTicketDetailScreen mode="new" {...props} />;
}
