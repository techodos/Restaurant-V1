-- =============================================================================
-- 0047 — Reviews belong to the branch that served the order
--
-- `reviews.location_id` drives branch scoping (admin reviews list via branchFilter, the 0029 write guard), but
-- reviews were stored without it, so every order review showed under every branch and any branch manager could
-- moderate or reply to another branch's reviews. New reviews now take the order's branch (services/reviews.ts);
-- this copies it onto the reviews written before. Only empty values are filled, from the review's own order in
-- the same restaurant, so it is safe to run again and never moves a review that already has a branch.
-- =============================================================================

update reviews r
   set location_id = o.location_id
  from orders o
 where r.location_id is null
   and r.order_id = o.id
   and o.restaurant_id = r.restaurant_id
   and o.location_id is not null;
