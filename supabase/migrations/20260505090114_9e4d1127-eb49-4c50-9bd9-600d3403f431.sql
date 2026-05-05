CREATE POLICY "Admins can update images"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'images' AND public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (bucket_id = 'images' AND public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins can delete images"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'images' AND public.has_role(auth.uid(), 'admin'::public.app_role));