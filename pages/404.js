import { useEffect } from 'react';
import { useRouter } from 'next/router';

const NotFoundPage = () => {
  const router = useRouter();

  useEffect(() => {
    // Get the current URL
    const currentUrl = window.location.href;

    // Remove '/auth/null' from the URL if it exists
    const cleanedUrl = currentUrl.replace('/auth/null', '');

    // Redirect to the cleaned URL, or to the homepage if the URL is empty
    window.location.href = cleanedUrl || '/';
  }, []);

  return null; // Don't render anything since it's an automatic redirect
};

export default NotFoundPage;
