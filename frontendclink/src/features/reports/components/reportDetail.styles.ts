import { StyleSheet } from 'react-native';
import { reportColors as c } from './reports.styles';

export const reportDetailStyles = StyleSheet.create({
  content: { width: '100%', maxWidth: 820, alignSelf: 'center', gap: 14 },
  summary: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  thumbnail: { width: 68, height: 76, borderRadius: 13, backgroundColor: '#E4ECF3', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  summaryInfo: { flex: 1, minWidth: 0, gap: 5 }, price: { color: c.PRIMARY, fontSize: 16, lineHeight: 23, fontWeight: '700' },
  timeline: { gap: 0 }, event: { flexDirection: 'row', alignItems: 'stretch', gap: 12 },
  rail: { width: 30, alignItems: 'center' }, dot: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#E5EDF5', alignItems: 'center', justifyContent: 'center' },
  doneDot: { backgroundColor: '#226A4C' }, progressDot: { backgroundColor: '#2C6495' }, line: { flex: 1, width: 2, backgroundColor: '#D6E1EB', marginTop: 4, minHeight: 18 },
  eventBody: { flex: 1, minWidth: 0, paddingTop: 1, paddingBottom: 18, gap: 7 }, lastEvent: { paddingBottom: 0 },
  eventTitle: { color: c.PRIMARY, fontSize: 15, lineHeight: 22, fontWeight: '700' }, timestamp: { color: c.SECONDARY, fontSize: 12, lineHeight: 18 },
  historyText: { color: '#244C70', fontSize: 14, lineHeight: 21 }, strong: { fontWeight: '700' },
  measure: { alignSelf: 'flex-start', backgroundColor: '#EFF5FA', borderRadius: 9, paddingHorizontal: 10, paddingVertical: 5, maxWidth: '100%' },
  footer: { borderTopWidth: 1, borderTopColor: c.border, paddingTop: 14, flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  disclosure: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  disclosureText: { flex: 1, color: c.PRIMARY, fontSize: 14, lineHeight: 21, fontWeight: '700', minWidth: 0 },
  disclosureCard: { backgroundColor: c.surface, borderRadius: 18, paddingHorizontal: 18, paddingVertical: 6, borderWidth: 1, borderColor: c.border, gap: 8 },
  snapshot: { borderTopWidth: 1, borderTopColor: c.border, paddingTop: 16, paddingBottom: 12, gap: 16 },
  originalNotice: { backgroundColor: '#EAF2F8', borderRadius: 14, padding: 14, flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  preview: { borderWidth: 1, borderColor: '#DFE8F0', borderRadius: 16, overflow: 'hidden' },
  imagePlaceholder: { minHeight: 176, backgroundColor: '#E3EBF3', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 16 },
  imageCount: { alignSelf: 'flex-end', backgroundColor: c.PRIMARY, borderRadius: 14, paddingHorizontal: 9, paddingVertical: 4, marginTop: 12 },
  imageCountText: { color: '#FFFFFF', fontSize: 11, lineHeight: 16, fontWeight: '600' },
  previewBody: { padding: 16, gap: 12 }, tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  tag: { backgroundColor: '#EFF4F8', borderRadius: 16, paddingHorizontal: 10, paddingVertical: 5, maxWidth: '100%' },
  stateTag: { backgroundColor: '#E5F3EC' }, tagText: { color: c.PRIMARY, fontSize: 12, lineHeight: 18 },
});
