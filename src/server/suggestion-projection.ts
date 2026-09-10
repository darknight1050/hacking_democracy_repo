import { categoryColumns } from './categories';
/** Only fields used to render a voting or winner card. Never select a database row wholesale. */
export const suggestionColumns = `s.id,s.cost,s.title,s.description,s.location,s.latitude,s.longitude,s.district_id,d.name AS district,s.image IS NOT NULL OR s.image_url IS NOT NULL AS has_image,s.image_url,${categoryColumns}`;
