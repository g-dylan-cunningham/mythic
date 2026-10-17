-- Preserve lower-confidence evidence for review, but keep it out of the
-- automatic matching path, which loads active relationships only.
update public.apparel_vendor_catalog_mappings
set
  review_status = 'proposed',
  updated_at = now()
where mapping_source = 'historical_reconciliation'
  and review_status = 'active'
  and confidence_score < 0.9700;
