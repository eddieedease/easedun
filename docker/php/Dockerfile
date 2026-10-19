# PHP + Apache, kept close to a typical shared-hosting setup.
FROM php:8.3-apache

ARG UID=1000
ARG GID=1000

RUN docker-php-ext-install pdo_mysql \
    && a2enmod rewrite headers \
    && sed -ri 's/AllowOverride None/AllowOverride All/g' /etc/apache2/apache2.conf \
    # Run Apache as the host user so the installer can write server/config.php
    # into the bind-mounted backend folder.
    && groupmod -o -g ${GID} www-data \
    && usermod -o -u ${UID} -g ${GID} www-data

COPY php.ini /usr/local/etc/php/conf.d/dev.ini
