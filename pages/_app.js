import App from 'next/app';
import Head from 'next/head';
import { AppProvider } from '@shopify/polaris';
import { Provider } from '@shopify/app-bridge-react';
// import '@shopify/polaris/styles.css';
import translations from '@shopify/polaris/locales/en.json';
import Cookies from 'js-cookie';
import ApolloClient from 'apollo-boost';
import { ApolloProvider } from 'react-apollo';
import React from 'react'
import { useEffect } from 'react';
// import '@shopify/polaris/build/esm/styles.css';
import { useRouter } from 'next/router'

const client = new ApolloClient({
  fetchOptions: {
    credentials: 'include'
  },
});





const MyApp = ({ Component, pageProps }) => {
  const router = useRouter();



  const config = {
    apiKey: API_KEY, // Ensure API_KEY is defined somewhere
    shopOrigin: Cookies.get('shopOrigin'),
    forceRedirect: true,
  };

  return (
    <React.Fragment>
      <Head>
        <title>Shopify App</title>
        <meta charSet="utf-8" />
        <script src="https://cdn.tailwindcss.com"></script>
      </Head>
      <Provider config={config}>
        <AppProvider i18n={translations}>
          <ApolloProvider client={client}>
            <Component {...pageProps} />
          </ApolloProvider>
        </AppProvider>
      </Provider>
    </React.Fragment>
  );
};

export default MyApp;


