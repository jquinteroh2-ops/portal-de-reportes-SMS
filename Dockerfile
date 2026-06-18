FROM nginx:alpine
COPY index.html styles.css app.js /usr/share/nginx/html/
COPY nginx.conf /etc/nginx/templates/default.conf.template
ENV PORT=80
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
