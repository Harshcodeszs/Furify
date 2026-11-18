/* ==========================================================
   js/api.js — Furify API Abstraction Layer
   ========================================================== */
(() => {
  window.FurifyAPI = {
    history: {
   
       async list() {
        const supabase = window.supabase;
        
        if (!supabase || !supabase.auth) {
          console.warn("Supabase client not found in api.js. Returning local history.");
          const local = localStorage.getItem('furify_history');
          return local ? JSON.parse(local) : [];
        }

        try {
          const { data: { user }, error: userError } = await supabase.auth.getUser();
          const guestId = localStorage.getItem('furify_guest_id');

          let data = [];

          // If logged in, fetch directly from Supabase via RLS
          if (!userError && user) {
            const { data: dbData, error } = await supabase
              .from('scan')
              .select(`
                scan_id,
                image_path,
                scanned_at,
                scan_result (
                  confidence_score,
                  rank,
                  breed:breed_id (
                    breed_name
                  )
                )
              `)
              .eq('user_id', user.id)
              .order('scanned_at', { ascending: false });

            if (error) throw error;
            data = dbData;
          } 
          // If guest, fetch securely through your FastAPI backend proxy
          else if (guestId) {
            const response = await fetch('/api/guest-history', {
              headers: {
                'X-Guest-Device-ID': guestId
              }
            });
            if (!response.ok) throw new Error("Failed to fetch guest history from backend");
            const result = await response.json();
            data = result.data;
          } else {
            const local = localStorage.getItem('furify_history');
            return local ? JSON.parse(local) : [];
          }

          // Format database rows and resolve signed URLs asynchronously
          return await Promise.all((data || []).map(async (row) => {
            const topResult = row.scan_result?.[0] || {};
            const matches = (row.scan_result || []).map(r => ({
              breed: r.breed?.breed_name || 'Unknown',
              confidence: Number(r.confidence_score) || 0
            }));

            // Fixed asset fallback path matching history.js
            let imageUrl = 'assets/image/goldenNoBG.png';

            if (row.image_path) {
              if (row.image_path.startsWith('http') || row.image_path.startsWith('data:')) {
                imageUrl = row.image_path;
              } else {
                // Sanitize path: strip leading slashes or accidental bucket prefixes
                let cleanPath = row.image_path.trim();
                if (cleanPath.startsWith('/')) cleanPath = cleanPath.substring(1);
                if (cleanPath.startsWith('scans/')) cleanPath = cleanPath.replace(/^scans\//, '');

                // Request a temporary signed URL (valid 60 min) from private bucket
                const { data: signedData, error: signError } = await supabase.storage
                  .from('scans')
                  .createSignedUrl(cleanPath, 3600);

                if (!signError && signedData?.signedUrl) {
                  imageUrl = signedData.signedUrl;
                } else {
                  console.error(`Storage Error [${signError?.name || 'Unknown'}]: ${signError?.message} for path: ${cleanPath}`);
                }
              }
            }

            return {
              id: row.scan_id,
              breed: topResult.breed?.breed_name || 'Unknown Breed',
              confidence: Number(topResult.confidence_score) || 0,
              date: row.scanned_at,
              image: imageUrl,
              matches: matches,
              reason: ""
            };
          }));

        } catch (err) {
          console.error("Failed to fetch history, falling back to local storage.", err);
          const local = localStorage.getItem('furify_history');
          return local ? JSON.parse(local) : [];
        }
      },

      async remove(id) {
        const supabase = window.supabase;
        if (!supabase) return;

        try {
          // Check if the current user is logged in before allowing deletion
          const { data: { user }, error: userError } = await supabase.auth.getUser();
          if (userError || !user) {
            console.warn("Guests are not permitted to delete history items.");
            alert("Please log in to manage or delete your scan history.");
            return;
          }

          // If logged in, proceed with deleting from the 'scan' table
          const { error } = await supabase
            .from('scan')
            .delete()
            .eq('scan_id', id)
            .eq('user_id', user.id); // Extra safety: ensure they only delete their own

          if (error) throw error;
        } catch (err) {
          console.error("Supabase history delete error:", err);
          // Fallback logic if using local storage
          const local = localStorage.getItem('furify_history');
          if (local) {
            let items = JSON.parse(local);
            items = items.filter((item) => item.id !== id);
            localStorage.setItem('furify_history', JSON.stringify(items));
          }
        }
      }
      
    }
  };
})();