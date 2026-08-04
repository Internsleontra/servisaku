-- Service-address coordinates for partner route suggestion.
--
-- Additive and nullable. Nothing populates these yet — that needs a geocoder,
-- which is a separate decision. The route optimiser already treats a booking
-- without coordinates as unplannable and says so, so shipping the columns ahead
-- of the geocoder changes no behaviour.

ALTER TABLE "Booking" ADD COLUMN "lat" DOUBLE PRECISION;
ALTER TABLE "Booking" ADD COLUMN "lng" DOUBLE PRECISION;
